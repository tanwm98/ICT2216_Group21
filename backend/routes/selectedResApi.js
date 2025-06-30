const pool = require('../../db');
const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { authenticateToken, requireUser } = require('../../frontend/js/token');
const { createRateLimiter } = require('../middleware/sanitization');

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

function getCurrentSGTDate() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));

  // Manually construct the date in local time
  return new Date(
    parseInt(map.year),
    parseInt(map.month) - 1,
    parseInt(map.day),
    parseInt(map.hour) - 8,
    parseInt(map.minute),
    parseInt(map.second)
  );
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

const { reserveValidator, updateReservationValidator, reviewValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');
const { decodeHtmlEntities } = require('../middleware/htmlDecoder');
const { debugDecode } = require('../middleware/htmlDecoder');

// Route to display data
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
            AND s.status = 'approved'
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


// Route to get reviews for the selected shop
router.get('/display_reviews', async (req, res) => {
  try {
    const storeid = req.query.storeid;

    // Input validation
    const storeIdNum = parseInt(storeid);
    if (isNaN(storeIdNum) || storeIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid store ID' });
    }

    const storeCheck = await pool.query(
      'SELECT 1 FROM stores WHERE store_id = $1 AND status = $2',
      [storeIdNum, 'approved']
    );

    if (storeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found or not available' });
    }

    // Only show reviews for approved restaurants
    const result = await pool.query(
      'SELECT * FROM reviews WHERE "store_id" = $1',
      [storeIdNum]
    );

    // Decode review descriptions recursively
    const decoded = result.rows.map(r => {
      console.log('[RAW FROM DB]', r.description);
      const clean = debugDecode(r.description || '');
      return {
        ...r,
        description: clean
      };
    });

    res.json(decoded);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// add reservation into reserve table
router.get('/reserve', reserveValidator, handleValidation, async (req, res) => {
  try {
    const pax = req.query.pax;
    const time = req.query.time;
    const date = req.query.date;
    const userid = req.query.userid;
    const storeid = req.query.storeid;
    const firstname = req.query.firstname;
    const lastname = req.query.lastname;
    const specialreq = req.query.specialrequest;
    const storename = req.query.storename;
    const adultpax = req.query.adultpax;
    const childpax = req.query.childpax;

    const [year, month, day] = date.split('-'); // e.g. "2025-06-30"
    const [hour, minute] = time.split(':');     // e.g. "11:30"

    const reservationDateTimeSGT = new Date(Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour) - 8, // convert to UTC equivalent
      parseInt(minute)
    ));

    // Current time in SGT
    const nowSGT = getCurrentSGTDate();

    console.log("[DEBUG] Reservation DateTime (SGT):", reservationDateTimeSGT.toISOString());
    console.log("[DEBUG] Current DateTime (SGT):", nowSGT.toLocaleString("en-SG", { timeZone: "Asia/Singapore" }))

    if (reservationDateTimeSGT < nowSGT) {
      return res.status(400).json({ message: "Cannot make a reservation in the past." });
    }

    // 1. Enforce 1-hour cooldown since last reservation creation
    const cooldownCheck = await pool.query(`
      SELECT 1 FROM reservations 
      WHERE "user_id" = $1 
      AND created_at > (NOW() - INTERVAL '1 hour')`, 
      [userid]);

    if (cooldownCheck.rowCount > 0) {
      return res.status(429).json({ message: 'You can only make one reservation per hour. Please try again later.' });
    }

    // 2. Check for existing reservation at same time/store
    const checkExistingReservation = await pool.query(`
      SELECT * FROM reservations 
      WHERE "store_id" = $1 AND "user_id" = $2 AND "reservationTime" = $3 AND "reservationDate" = $4 AND "status" = 'Confirmed'
    `, [storeid, userid, time, date]);

    if (checkExistingReservation.rows.length > 0) {
      return res.status(400).json({ message: "You already have a reservation for that time." });
    }

    // 3. Check capacity
    const storeDetails = await pool.query(`
      SELECT "currentCapacity" FROM stores WHERE "store_id" = $1
    `, [storeid]);

    const currentCapacity = storeDetails.rows[0].currentCapacity;

    if (parseInt(pax) > currentCapacity) {
      return res.status(400).json({
        message: `Reservation exceeds remaining capacity of ${currentCapacity}.`
      });
    }

    // 4. Get store details (for address)
    const storeResult = await pool.query(`
      SELECT * FROM stores WHERE "store_id" = $1
    `, [storeid]);

    const store = storeResult.rows;

    // 5. Insert reservation
    const reserveresult = await pool.query(`
      INSERT INTO reservations 
      ("user_id", "store_id", "noOfGuest", "reservationTime", "reservationDate", 
      "specialRequest", "first_name", "last_name", "childPax", "adultPax", "created_at")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`, 
      [userid, storeid, pax, time, date, specialreq, firstname, lastname, childpax, adultpax]);

    // 6. Update capacity
    await pool.query(`
      UPDATE stores 
      SET "currentCapacity" = "currentCapacity" - $1 
      WHERE "store_id" = $2
    `, [pax, storeid]);

    // 7. Get user name
    const usernameResult = await pool.query(`
      SELECT name, email FROM users WHERE "user_id" = $1
    `, [userid]);
    const userEmail = usernameResult.rows[0]?.email;
    const username = usernameResult.rows[0]?.name;

    // 8. Send confirmation email
    await transporter.sendMail({
      from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `Reservation Confirmed at ${storename}`,
      html: `
        <p>Hello ${username},</p>
        <p>Your reservation with ${storename} is <strong>confirmed</strong>. See below for more details.</p>
        <h4>Reservation Details:</h4>
        <ul>
          <li><strong>👤 First Name:</strong> ${firstname}</li>
          <li><strong>👤 Last Name:</strong> ${lastname}</li>
          <li><strong>🏪 Restaurant:</strong> ${storename}</li>
          <li><strong>📍 Location:</strong> ${store[0].address}</li>
          <li><strong>📅 Date:</strong> ${date}</li>
          <li><strong>🕒 Time:</strong> ${time}</li>
          <li><strong>👥 Number of Guests:</strong> ${pax}
            <ul>
              <li><strong>Number of Adults:</strong> ${adultpax}</li>
              <li><strong>Number of Child:</strong> ${childpax}</li>
            </ul>
          </li>
          ${specialreq ? `<li><strong>📢 Special Request:</strong> ${specialreq}</li>` : ''}
        </ul>
        <p>Thank you!</p>
        <p>Kirby Chope</p>
      `
    });

    res.json(reserveresult.rows);

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to insert data' });
  }
});

// Update reservation
router.post('/update_reservation', updateReservationValidator, handleValidation, async (req, res) => {
  try {
    const { pax, time, date, firstname, lastname, specialrequest, reservationid, adultpax, childpax, storename, userid } = req.body;

    // Step 1: Get original reservation to restore its pax
    const originalRes = await pool.query(
      `SELECT "store_id", "noOfGuest", "reservationDate", "reservationTime", "specialRequest", "status"
      FROM reservations WHERE reservation_id = $1`,
      [reservationid]
    );

    if (originalRes.rows.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (originalRes.rows[0].status === 'Cancelled') {
      return res.status(400).json({ message: 'Cannot update a cancelled reservation.' });
    }

    const storeId = originalRes.rows[0].store_id;
    const originalPax = originalRes.rows[0].noOfGuest;

    const original = originalRes.rows[0];
    const formatTime = t => (t ? t.slice(0, 5) : ''); // Extract HH:MM from both "12:30:00" or "12:30"
    const originalSpecial = decodeHtmlEntities(original.specialRequest || '');
    const decodedRequestSpecial = decodeHtmlEntities(specialrequest || '');

    // Final comparison
    const isSame =
      parseInt(pax) === original.noOfGuest &&
      date === original.reservationDate.toISOString().split('T')[0] &&
      formatTime(time) === formatTime(original.reservationTime) &&
      decodedRequestSpecial === originalSpecial;

    console.log('Compare original vs new:', {
      pax: [original.noOfGuest, pax],
      date: [original.reservationDate.toISOString().split('T')[0], date],
      time: [formatTime(original.reservationTime), formatTime(time)],
      specialrequest: [originalSpecial, decodedRequestSpecial]
    });

    if (isSame) {
      return res.status(400).json({ message: 'No changes detected in reservation.' });
    }

    console.log('Compare original vs new:', {
      pax: [original.noOfGuest, pax],
      date: [original.reservationDate?.toISOString().split('T')[0], date],
      time: [original.reservationTime, time],
      specialrequest: [original.specialRequest, specialrequest]
    });

    // Step 1.5: Enforce 3 edits/day/user/reservation
    const nowSGT = getCurrentSGTDate();
    const today = nowSGT.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

    const editLimitCheck = await pool.query(
      `SELECT COUNT(*) FROM reservation_edits 
      WHERE user_id = $1 AND reservation_id = $2 
      AND DATE(edited_at AT TIME ZONE 'Asia/Singapore') = $3`,
      [userid, reservationid, today]
    );

    if (parseInt(editLimitCheck.rows[0].count) >= 3) {
      return res.status(429).json({
        message: "Edit limit reached. You can only update this reservation 3 times per day."
      });
    }

    // Step 2: Restore old pax to currentCapacity
    await pool.query(
      'UPDATE stores SET "currentCapacity" = "currentCapacity" + $1 WHERE store_id = $2',
      [originalPax, storeId]
    );

    // Step 3: Fetch total and current capacity for validation
    const capacityResult = await pool.query(
      'SELECT "totalCapacity", "currentCapacity", address FROM stores WHERE store_id = $1',
      [storeId]
    );
    const { totalCapacity, currentCapacity, address } = capacityResult.rows[0];

    // Step 4: Check if new pax exceeds available capacity
    if (parseInt(pax) > currentCapacity) {
      return res.status(400).json({ message: `Reservation exceeds available capacity of ${currentCapacity}.` });
    }

    // Step 5: Deduct new pax from current capacity
    await pool.query(
      'UPDATE stores SET "currentCapacity" = "currentCapacity" - $1 WHERE store_id = $2',
      [pax, storeId]
    );

    // Step 6: Update reservation
    await pool.query(`
      UPDATE reservations 
      SET "noOfGuest" = $1, 
          "reservationDate" = $2, 
          "reservationTime" = $3, 
          "specialRequest" = $4, 
          "adultPax" = $5,
          "childPax" = $6,
          "first_name" = $7,
          "last_name" = $8
      WHERE reservation_id = $9
    `, [pax, date, time, specialrequest, adultpax, childpax, firstname, lastname, reservationid]);
    
    // Step 6.5: Record this edit in the reservation_edits log
    await pool.query(
      `INSERT INTO reservation_edits (user_id, reservation_id, edited_at)
      VALUES ($1, $2, NOW())`,
      [userid, reservationid]
    );

    // Step 7: Fetch user name
    const usernameResult = await pool.query("SELECT name, email FROM users WHERE user_id = $1", [userid]);
    const username = usernameResult.rows[0]?.name || '';
    const userEmail = usernameResult.rows[0]?.email || '';
    // Step 8: Send email notification
    await transporter.sendMail({
      from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `Modification of Reservation at ${storename}`,
      html: `
        <p>Hello ${username},</p>
        <p>Your reservation with ${storename} has been successfully <strong>updated</strong>. See below for updated details.</p>
        <h4>Updated Reservation Details:</h4>
        <ul>
          <li><strong>👤 First Name:</strong> ${firstname}</li>
          <li><strong>👤 Last Name:</strong> ${lastname}</li>
          <li><strong>🏪 Restaurant:</strong> ${storename}</li>
          <li><strong>📍 Location:</strong> ${address}</li>
          <li><strong>📅 Date:</strong> ${date}</li>
          <li><strong>🕒 Time:</strong> ${time}</li>
          <li><strong>👥 Number of Guests:</strong> ${pax}
            <ul>
              <li><strong>Number of Adults:</strong> ${adultpax}</li>
              <li><strong>Number of Child:</strong> ${childpax}</li>
            </ul>
          </li>
          ${specialrequest ? `<li><strong>📢 Special Request:</strong> ${specialrequest}</li>` : ''}
        </ul>
        <p>Thank you!</p>
        <p>Kirby Chope</p>
      `
    });

    res.status(200).json({ message: 'Reservation updated successfully.' });

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to update reservation.' });
  }
});

cron.schedule('0 * * * *', async () => { // Run every hour instead of every minute
  console.log('Checking for completed reservations...');
  console.log('🕐 Testing cron job...', new Date());
  try {
    const result = await pool.query(`
      SELECT reservation_id, "noOfGuest", store_id
      FROM reservations
      WHERE NOW() >= ("reservationDate"::timestamp + "reservationTime"::interval + INTERVAL '1 hour')
      AND status = 'Confirmed'
    `);

    for (const reservation of result.rows) {
      // Update status to Completed
      await pool.query(
        'UPDATE reservations SET status = $1 WHERE reservation_id = $2',
        ['Completed', reservation.reservation_id]
      );

      // Add back capacity to the restaurant
      await pool.query(
        'UPDATE stores SET "currentCapacity" = LEAST("currentCapacity" + $1, "totalCapacity") WHERE store_id = $2',
        [reservation.noOfGuest, reservation.store_id]
      );
    }

    if (result.rows.length > 0) {
      console.log(`Updated ${result.rows.length} reservations to Completed status`);
    }
  } catch (err) {
    console.error('Error updating reservation statuses:', err);
  }
});

// another cron for reservation reminder email
cron.schedule('0 * * * *', async () => {
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
  )

  const results = result.rows;

  if (results.length == 0) {
    console.log("No reservations a day from now");
  } else {
    for (const r of results) {
      // get user details of each of the reservation 
      const user_details = await pool.query(
        `
        SELECT * FROM users WHERE user_id = $1
      `, [r.user_id]
      )

      const store_details = await pool.query(
        `
        SELECT * FROM stores WHERE store_id = $1
      `, [r.store_id]
      )
      const user = user_details.rows;
      const store = store_details.rows;

      if (r.is_reminded == false) {
        await transporter.sendMail({
          from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
          to: user[0].email,
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
        })
        await pool.query('UPDATE reservations SET is_reminded = true WHERE reservation_id = $1', [r.reservation_id]);

      }
    }

  }
})

// query reservations between certain timing
router.get('/timeslots', async (req, res) => {
  try {
    const date = req.query.date;

    console.log(date);

    const result = await pool.query(
      `
        SELECT * FROM reservations WHERE "reservationDate" = $1 AND "status" = 'Confirmed'
      `,
      [date]
    );


    res.json(result.rows); // send data back as json
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
})

// getting specific reservation by id for editing reservation details
router.get('/get_reservation_by_id', async (req, res) => {
  try {
    const reservationid = req.query.reservationid;

    console.log(reservationid);

    const result = await pool.query(
      `
        SELECT r.reservation_id, r.store_id, r."noOfGuest", r."reservationDate"::TEXT, r."reservationTime",
        r."specialRequest", r.status, r."adultPax", r."childPax", r."first_name", r."last_name"
        FROM reservations r WHERE "reservation_id" = $1
      `,
      [reservationid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = result.rows[0];

    console.log('[RAW SPECIAL REQUEST]', reservation.specialRequest);

    // Decode specialRequest safely for display
    reservation.specialRequest = debugDecode(reservation.specialRequest || '');

    res.json([reservation]); // Wrap in array as expected by frontend
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// query to get max capacity of store 
router.get('/maxcapacity', async (req, res) => {
  try {
    const storeid = req.query.storeid;
    const result = await pool.query(
      `
        SELECT * FROM stores WHERE "store_id" = $1 AND status = 'approved'
      `,
      [storeid]
    );
    res.json(result.rows);

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
})

// get first and last name of user
router.get('/get_name', authenticateToken, requireUser, async (req, res) => {
  try {
    const requestedUserId = parseInt(req.query.userid);
    const loggedInUserId = req.user.userId;

    // Authorization check - users can only access their own data
    if (requestedUserId !== loggedInUserId) {
      return res.status(403).json({
        error: 'Access denied. You can only access your own information.'
      });
    }

    // Only return necessary fields instead of ALL user data
    const result = await pool.query(
      'SELECT firstname, lastname FROM users WHERE user_id = $1',
      [requestedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Get user profile
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

// Check reservation
router.get('/check-reservation', async (req, res) => {
  const { userid, storeid } = req.query;

  console.log("Checking reservation for user:", userid, "store:", storeid);

  try {
    const result = await pool.query(`
      SELECT * FROM reservations
      WHERE "user_id" = $1 AND "store_id" = $2
      LIMIT 1
    `, [userid, storeid]);

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

// add review
router.post('/add-review', reviewValidator, handleValidation, async (req, res) => {
  const { userid, storeid, rating, review } = req.body;

  console.log("Received review submission:");
  console.log("User ID:", userid);
  console.log("Store ID:", storeid);
  console.log("Rating:", rating);
  console.log("Review Text:", review);

  if (!userid || !storeid || !rating || !review) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const nowSGT = getCurrentSGTDate();
    const todaySGTString = nowSGT.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

    const existingReview = await pool.query(`
      SELECT created_at FROM reviews 
      WHERE user_id = $1 AND store_id = $2 
      AND DATE(created_at AT TIME ZONE 'Asia/Singapore') = $3
    `, [userid, storeid, todaySGTString]);

    if (existingReview.rowCount > 0) {
      return res.status(400).json({ error: 'You have already submitted a review for this restaurant today.' });
    }

    const insertResult = await pool.query(`
      INSERT INTO reviews (user_id, store_id, rating, description, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING created_at
    `, [userid, storeid, rating, review]);

    res.status(201).json({ message: 'Review submitted successfully.' });

  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

module.exports = router;

