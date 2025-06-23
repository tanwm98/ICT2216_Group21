const pool = require('../../db');  // import connection string from db.js
const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const nodemailer = require('nodemailer');

// Configure email
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// SECURITY: Validate and generate secure image URLs
function validateAndGenerateImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }

    // SECURITY: Validate filename format to prevent directory traversal
    const safeFilenameRegex = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i;
    if (!safeFilenameRegex.test(imageFilename)) {
        console.warn('Invalid image filename detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    // SECURITY: Ensure filename doesn't contain path traversal attempts
    if (imageFilename.includes('..') || imageFilename.includes('/') || imageFilename.includes('\\')) {
        console.warn('Path traversal attempt detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    return `/static/img/restaurants/${imageFilename}`;
}

// SECURITY: Sanitize alt text to prevent XSS
function sanitizeAltText(altText, storeName) {
    if (!altText || typeof altText !== 'string') {
        return `${sanitizeString(storeName || 'Unknown Restaurant')} restaurant image`;
    }

    return sanitizeString(altText.substring(0, 100)); // Limit length
}

// SECURITY: General string sanitization
function sanitizeString(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str
        .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
        .trim()
        .substring(0, 255); // Limit length
}

// FIXED: Route to display specific store data with secure image URLs
router.get('/display_specific_store', async (req, res) => {
  try {
    // SECURITY: Validate required parameters
    const { name, location, reservationid } = req.query;

    if (!name || !location) {
        return res.status(400).json({
            error: 'Missing required parameters',
            required: ['name', 'location']
        });
    }

    // SECURITY: Validate input lengths
    if (name.length > 100 || location.length > 100) {
        return res.status(400).json({
            error: 'Parameter length exceeds maximum allowed'
        });
    }

    let result;

    // FIXED: Corrected SQL query structure and selected specific columns
    if (reservationid) {
        // SECURITY: Validate reservationid if provided
        const reservationIdNum = parseInt(reservationid);
        if (isNaN(reservationIdNum)) {
            return res.status(400).json({
                error: 'Invalid reservation ID format'
            });
        }

        // UPDATED: Select image_filename and image_alt_text instead of image
        result = await pool.query(`
            SELECT
                s.store_id,
                s."storeName",
                s.image_filename,
                s.image_alt_text,
                s.cuisine,
                s.location,
                s."priceRange",
                s.address,
                s."postalCode",
                s.opening,
                s.closing,
                s."currentCapacity",
                s."totalCapacity",
                r.reservation_id,
                r."noOfGuest",
                r."reservationDate",
                r."reservationTime"
            FROM stores s
            INNER JOIN reservations r ON r.store_id = s.store_id
            WHERE s."storeName" = $1 AND s.location = $2 AND r.reservation_id = $3
        `, [name, location, reservationIdNum]);
    } else {
        // UPDATED: Select image_filename and image_alt_text instead of image
        result = await pool.query(`
            SELECT
                store_id,
                "storeName",
                image_filename,
                image_alt_text,
                cuisine,
                location,
                "priceRange",
                address,
                "postalCode",
                opening,
                closing,
                "currentCapacity",
                "totalCapacity"
            FROM stores
            WHERE "storeName" = $1 AND location = $2
        `, [name, location]);
    }

    if (result.rows.length === 0) {
        return res.status(404).json({
            error: 'Restaurant not found'
        });
    }

    // FIXED: Transform data to include secure image URLs
    const transformedStores = result.rows.map(store => ({
        store_id: store.store_id,
        storeName: store.storeName,
        location: store.location,
        cuisine: store.cuisine,
        priceRange: store.priceRange,
        address: store.address,
        postalCode: store.postalCode,
        opening: store.opening,
        closing: store.closing,
        currentCapacity: store.currentCapacity,
        totalCapacity: store.totalCapacity,

        // Include reservation data if available
        ...(store.reservation_id && {
            reservation_id: store.reservation_id,
            noOfGuest: store.noOfGuest,
            reservationDate: store.reservationDate,
            reservationTime: store.reservationTime
        }),

        // FIXED: Generate secure image URLs instead of base64
        imageUrl: validateAndGenerateImageUrl(store.image_filename),
        altText: sanitizeAltText(store.image_alt_text, store.storeName)
    }));

    // SECURITY: Add security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300'
    });

    res.json(transformedStores);

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// ======================================
// OTHER ROUTES (Enhanced with security)
// ======================================

// ENHANCED: Route to get reviews for the selected shop
router.get('/display_reviews', async (req, res) => {
  try {
    // SECURITY: Validate store ID
    const storeid = req.query.storeid;

    if (!storeid) {
        return res.status(400).json({
            error: 'Store ID is required'
        });
    }

    const storeIdNum = parseInt(storeid);
    if (isNaN(storeIdNum)) {
        return res.status(400).json({
            error: 'Invalid store ID format'
        });
    }

    const result = await pool.query('SELECT * FROM reviews WHERE "store_id" = $1', [storeIdNum]);

    // SECURITY: Add security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=180' // 3 minutes cache for reviews
    });

    res.json(result.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// ENHANCED: Add reservation with input validation and XSS prevention
router.get('/reserve', async (req, res) => {
  try {
    // SECURITY: Validate and sanitize all inputs
    const {
        pax, time, date, userid, storeid, firstname, lastname,
        specialreq, storename, adultpax, childpax
    } = req.query;

    // Required field validation
    if (!pax || !time || !date || !userid || !storeid || !firstname || !lastname || !storename) {
        return res.status(400).json({
            error: 'Missing required fields'
        });
    }

    // Validate numeric inputs
    const paxNum = parseInt(pax);
    const useridNum = parseInt(userid);
    const storeidNum = parseInt(storeid);
    const adultpaxNum = parseInt(adultpax) || 0;
    const childpaxNum = parseInt(childpax) || 0;

    if (isNaN(paxNum) || isNaN(useridNum) || isNaN(storeidNum)) {
        return res.status(400).json({
            error: 'Invalid numeric values provided'
        });
    }

    // Validate pax limits
    if (paxNum < 1 || paxNum > 50) {
        return res.status(400).json({
            error: 'Number of guests must be between 1 and 50'
        });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return res.status(400).json({
            error: 'Invalid date format. Use YYYY-MM-DD'
        });
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
        return res.status(400).json({
            error: 'Invalid time format. Use HH:MM'
        });
    }

    // Check if reservation exists already
    const checkExistingReservation = await pool.query(
        `SELECT * FROM reservations
         WHERE "store_id" = $1 AND "user_id" = $2 AND "reservationTime" = $3 AND "reservationDate" = $4 AND "status" = 'Confirmed'`,
        [storeidNum, useridNum, time, date]
    );

    if (checkExistingReservation.rows.length > 0) {
      return res.status(400).json({ message: "You already have a reservation for that time." });
    }

    // Get store details
    const store_details = await pool.query(`SELECT * FROM stores WHERE store_id = $1`, [storeidNum]);
    const store = store_details.rows;

    if (store.length === 0) {
        return res.status(404).json({ error: 'Restaurant not found' });
    }

    // Insert reservation with sanitized data
    const reserveresult = await pool.query(
        'INSERT INTO reservations ("user_id", "store_id", "noOfGuest", "reservationTime", "reservationDate", "specialRequest", "first_name", "last_name", "childPax", "adultPax") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [useridNum, storeidNum, paxNum, time, date, specialreq || null, firstname, lastname, childpaxNum, adultpaxNum]
    );

    // Update current capacity
    await pool.query('UPDATE stores SET "currentCapacity" = "currentCapacity" - $1 WHERE "store_id" = $2', [paxNum, storeidNum]);

    // Get username
    const usernameResult = await pool.query('SELECT name FROM users WHERE "user_id" = $1', [useridNum]);
    const username = usernameResult.rows[0]?.name;

    // SECURITY: Sanitize data for email to prevent XSS in email clients
    const sanitizeForEmail = (str) => str ? str.replace(/[<>]/g, '') : '';

    // Send confirmation email
    await transporter.sendMail({
      from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
      to: 'dx8153@gmail.com',
      subject: `Reservation Confirmed at ${sanitizeForEmail(storename)}`,
      html: `
            <p>Hello ${sanitizeForEmail(username)},</p>
            <p>Your reservation with ${sanitizeForEmail(storename)} is <strong>confirmed</strong>. See below for more details.</p>
            <h4>Reservation Details:</h4>
            <ul>
                <li><strong>👤 First Name:</strong> ${sanitizeForEmail(firstname)}</li>
                <li><strong>👤 Last Name:</strong> ${sanitizeForEmail(lastname)}</li>
                <li><strong>🏪 Restaurant:</strong> ${sanitizeForEmail(storename)}</li>
                <li><strong>📍 Location:</strong> ${sanitizeForEmail(store[0].address)}</li>
                <li><strong>📅 Date:</strong> ${sanitizeForEmail(date)}</li>
                <li><strong>🕒 Time:</strong> ${sanitizeForEmail(time)}</li>
                <li><strong>👥 Number of Guests:</strong> ${paxNum}
                  <ul>
                    <li><strong>Number of Adults:</strong> ${adultpaxNum}</li>
                    <li><strong>Number of Child:</strong> ${childpaxNum}</li>
                  </ul>
                </li>
                ${specialreq ? `<li><strong>📢 Special Request:</strong> ${sanitizeForEmail(specialreq)}</li>` : ''}
            </ul>
            <p>Thank you!</p>
            <p>Kirby Chope</p>
          `
    });

    res.json({ message: 'Reservation created successfully', reservationId: reserveresult.insertId });

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to insert data' });
  }
});

// ENHANCED: Update reservation with input validation
router.post('/update_reservation', async (req, res) => {
  try {
    const {
        pax, time, date, firstname, lastname, specialreq,
        reservationid, adultpax, childpax, storename, userid
    } = req.body;

    // SECURITY: Validate required fields
    if (!pax || !time || !date || !firstname || !lastname || !reservationid || !userid) {
        return res.status(400).json({
            error: 'Missing required fields'
        });
    }

    // Validate numeric inputs
    const paxNum = parseInt(pax);
    const reservationidNum = parseInt(reservationid);
    const useridNum = parseInt(userid);
    const adultpaxNum = parseInt(adultpax) || 0;
    const childpaxNum = parseInt(childpax) || 0;

    if (isNaN(paxNum) || isNaN(reservationidNum) || isNaN(useridNum)) {
        return res.status(400).json({
            error: 'Invalid numeric values provided'
        });
    }

    // Validate pax limits
    if (paxNum < 1 || paxNum > 50) {
        return res.status(400).json({
            error: 'Number of guests must be between 1 and 50'
        });
    }

    await pool.query(`
      UPDATE reservations
      SET "noOfGuest" = $1,
          "reservationDate" = $2,
          "reservationTime" = $3,
          "specialRequest" = $4,
          "adultPax" = $5,
          "childPax" = $6
      WHERE reservation_id = $7
    `, [paxNum, date, time, specialreq || null, adultpaxNum, childpaxNum, reservationidNum]);

    // Get username and store details for email
    const usernameResult = await pool.query("SELECT name FROM users WHERE user_id = $1", [useridNum]);
    const username = usernameResult.rows[0]?.name;

    const which_store = await pool.query(`SELECT * FROM reservations WHERE reservation_id = $1`, [reservationidNum]);
    const store_details = await pool.query(`SELECT * FROM stores WHERE store_id = $1`, [(which_store.rows)[0].store_id]);

    // SECURITY: Sanitize data for email
    const sanitizeForEmail = (str) => str ? str.replace(/[<>]/g, '') : '';

    // Send update confirmation email
    await transporter.sendMail({
      from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
      to: 'ict2216kirby@gmail.com',
      subject: `Modification of Reservation at ${sanitizeForEmail(storename)}`,
      html: `
            <p>Hello ${sanitizeForEmail(username)},</p>
            <p>Your reservation with ${sanitizeForEmail(storename)} has been successfully <strong>updated</strong>. See below for updated details.</p>
            <h4>Updated Reservation Details:</h4>
            <ul>
                <li><strong>👤 First Name:</strong> ${sanitizeForEmail(firstname)}</li>
                <li><strong>👤 Last Name:</strong> ${sanitizeForEmail(lastname)}</li>
                <li><strong>🏪 Restaurant:</strong> ${sanitizeForEmail(storename)}</li>
                <li><strong>📍 Location:</strong> ${sanitizeForEmail((store_details.rows)[0].address)}</li>
                <li><strong>📅 Date:</strong> ${sanitizeForEmail(date)}</li>
                <li><strong>🕒 Time:</strong> ${sanitizeForEmail(time)}</li>
                <li><strong>👥 Number of Guests:</strong> ${paxNum}
                  <ul>
                    <li><strong>Number of Adults:</strong> ${adultpaxNum}</li>
                    <li><strong>Number of Child:</strong> ${childpaxNum}</li>
                  </ul>
                </li>
                ${specialreq ? `<li><strong>📢 Special Request:</strong> ${sanitizeForEmail(specialreq)}</li>` : ''}
            </ul>
            <p>Thank you!</p>
            <p>Kirby Chope</p>
          `
    });

    res.status(200).json({ message: 'Reservation updated successfully.' });

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to update data' });
  }
});

// ======================================
// KEEP ALL OTHER ROUTES UNCHANGED
// ======================================

// Cron job for reservation reminders
cron.schedule('0 * * * *', async () => {
  // ... (keep existing cron job code unchanged)
  const result = await pool.query(
    `
      SELECT *, "reservationDate"::TEXT AS date
      FROM reservations
      WHERE
        ("reservationDate"::timestamp + "reservationTime"::interval)
        BETWEEN
          ((NOW() + INTERVAL '24 hour') AT TIME ZONE 'Asia/Singapore') AND
          ((NOW() + INTERVAL '25 hour') AT TIME ZONE 'Asia/Singapore') AND
        status = 'Confirmed' AND is_reminded = FALSE
      `
  );

  const results = result.rows;

  if (results.length == 0) {
    console.log("No reservations a day from now");
  } else {
    for (const r of results) {
      const user_details = await pool.query(
        `SELECT * FROM users WHERE user_id = $1`, [r.user_id]
      );

      const store_details = await pool.query(
        `SELECT * FROM stores WHERE store_id = $1`, [r.store_id]
      );

      const user = user_details.rows;
      const store = store_details.rows;

      if (r.is_reminded == false) {
        await transporter.sendMail({
          from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
          to: 'chuaxinjing03@gmail.com',
          subject: `Reservation Reminder at ${store[0].storeName}`,
          html: `
              <p>Hello ${user[0].name},</p>
              <p>You have an upcoming reservation at ${store[0].storeName}. See below for more details.</p>
              <h4>Reservation Details:</h4>
              <ul>
                  <li><strong>👤 First Name:</strong> ${user[0].firstname}</li>
                  <li><strong>👤 Last Name:</strong> ${user[0].lastname}</li>
                  <li><strong>🏪 Restaurant:</strong> ${store[0].storeName}</li>
                  <li><strong>📍 Location:</strong> ${store[0].address}</li>
                  <li><strong>📅 Date:</strong> ${r.date}</li>
                  <li><strong>🕒 Time:</strong> ${r.reservationTime}</li>
                  <li><strong>👥 Number of Guests:</strong> ${r.noOfGuest}
                    <ul>
                      <li><strong>Number of Adults:</strong> ${r.adultPax}</li>
                      <li><strong>Number of Child:</strong> ${r.childPax}</li>
                    </ul>
                  </li>
                  ${r.specialreq ? `<li><strong>📢 Special Request:</strong> ${r.specialreq}</li>` : ''}
              </ul>
              <p>Thank you!</p>
              <p>Kirby Chope</p>
            `
        });
        await pool.query('UPDATE reservations SET is_reminded = true WHERE reservation_id = $1', [r.reservation_id]);
      }
    }
  }
});

// Keep all other existing routes unchanged...
router.get('/timeslots', async (req, res) => {
  try {
    const date = req.query.date;

    // SECURITY: Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return res.status(400).json({
            error: 'Invalid date format. Use YYYY-MM-DD'
        });
    }

    const result = await pool.query(
      `SELECT * FROM reservations WHERE "reservationDate" = $1 AND "status" = 'Confirmed'`,
      [date]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Keep other routes unchanged (get_reservation_by_id, maxcapacity, get_name, getUser, check-reservation, add-review)
router.get('/get_reservation_by_id', async (req, res) => {
  try {
    const reservationid = req.query.reservationid;

    // SECURITY: Validate reservation ID
    const reservationIdNum = parseInt(reservationid);
    if (isNaN(reservationIdNum)) {
        return res.status(400).json({
            error: 'Invalid reservation ID format'
        });
    }

    const result = await pool.query(
      `SELECT r.reservation_id, r.store_id, r."noOfGuest", r."reservationDate"::TEXT, r."reservationTime",
        r."specialRequest", r.status, r."adultPax", r."childPax", r."first_name", r."last_name"
        FROM reservations r WHERE "reservation_id" = $1`,
      [reservationIdNum]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

router.get('/maxcapacity', async (req, res) => {
  try {
    const storeid = req.query.storeid;

    // SECURITY: Validate store ID
    const storeIdNum = parseInt(storeid);
    if (isNaN(storeIdNum)) {
        return res.status(400).json({
            error: 'Invalid store ID format'
        });
    }

    const result = await pool.query(
      `SELECT * FROM stores WHERE "store_id" = $1`,
      [storeIdNum]
    );
    res.json(result.rows);

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

router.get('/get_name', async (req, res) => {
  try {
    const userid = req.query.userid;

    // SECURITY: Validate user ID
    const userIdNum = parseInt(userid);
    if (isNaN(userIdNum)) {
        return res.status(400).json({
            error: 'Invalid user ID format'
        });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE "user_id" = $1`, [userIdNum]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

router.get('/getUser', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const result = await pool.query(
      'SELECT name, email FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email } = result.rows[0];
    res.json({ name, email });

  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/check-reservation', async (req, res) => {
  const { userid, storeid } = req.query;

  // SECURITY: Validate inputs
  const userIdNum = parseInt(userid);
  const storeIdNum = parseInt(storeid);

  if (isNaN(userIdNum) || isNaN(storeIdNum)) {
      return res.status(400).json({
          error: 'Invalid user ID or store ID format'
      });
  }

  try {
    const result = await pool.query(`
      SELECT * FROM reservations
      WHERE "user_id" = $1 AND "store_id" = $2
      LIMIT 1
    `, [userIdNum, storeIdNum]);

    if (result.rows.length > 0) {
      res.json({ hasReserved: true });
    } else {
      res.json({ hasReserved: false });
    }
  } catch (err) {
    console.error("Error checking reservation:", err);
    res.status(500).json({ error: "Failed to check reservation." });
  }
});

router.post('/add-review', async (req, res) => {
  const { userid, storeid, rating, review } = req.body;

  // SECURITY: Validate inputs
  if (!userid || !storeid || !rating || !review) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const userIdNum = parseInt(userid);
  const storeIdNum = parseInt(storeid);
  const ratingNum = parseFloat(rating);

  if (isNaN(userIdNum) || isNaN(storeIdNum) || isNaN(ratingNum)) {
      return res.status(400).json({ error: 'Invalid numeric values provided.' });
  }

  if (ratingNum < 0.1 || ratingNum > 5.0) {
      return res.status(400).json({ error: 'Rating must be between 0.1 and 5.0.' });
  }

  if (review.length < 5 || review.length > 500) {
      return res.status(400).json({ error: 'Review must be between 5 and 500 characters.' });
  }

  try {
    const insertQuery = `
      INSERT INTO reviews ("user_id", "store_id", rating, description)
      VALUES ($1, $2, $3, $4)
    `;

    const values = [userIdNum, storeIdNum, ratingNum, review.trim()];

    await pool.query(insertQuery, values);

    res.status(201).json({
      message: 'Review submitted successfully.'
    });
  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

module.exports = router;