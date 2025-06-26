const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
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

const { reserveValidator, updateReservationValidator, reviewValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');

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
    // get store name from the request
    const storeid = req.query.storeid;
    const result = await pool.query('SELECT * FROM reviews WHERE "store_id" = $1', [storeid]);
    res.json(result.rows); // send data back as json
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
})

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

    // console.log("userid: " + userid);
    // console.log("Pax: " + pax);
    // console.log("time: " + time);
    // console.log("date: " + date);
    // console.log("storeid: " + storeid);
    // console.log("firstname: " + firstname);
    // console.log("lastname: " + lastname);
    // console.log("specialreq: " + specialreq);

    // check if reservation exist alr by same person, time and shop
    const checkExistingReservation = await pool.query(`SELECT * FROM reservations WHERE "store_id" = $1 AND "user_id" = $2 AND "reservationTime" = $3 AND "reservationDate" = $4 AND "status" = 'Confirmed'`, [storeid, userid, time, date]);
    console.log(checkExistingReservation.rows);

    const storeDetails = await pool.query('SELECT "currentCapacity" FROM stores WHERE store_id = $1', [storeid]);
    const currentCapacity = storeDetails.rows[0].currentCapacity;

    if (parseInt(pax) > currentCapacity) {
      return res.status(400).json({ message: `Reservation exceeds remaining capacity of ${currentCapacity}.` });
    }

    // get store details
    const store_details = await pool.query(`SELECT * FROM stores WHERE store_id = $1`, [storeid]);
    const store = store_details.rows;

    if (checkExistingReservation.rows.length > 0) {
      return res.status(400).json({ message: "You already have a reservation for that time." });
    } else {

      // insert into reservation
      const reserveresult = await pool.query('INSERT INTO reservations ("user_id", "store_id", "noOfGuest", "reservationTime", "reservationDate", "specialRequest", "first_name", "last_name", "childPax", "adultPax") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [userid, storeid, pax, time, date, specialreq, firstname, lastname, childpax, adultpax]);

      // // update current capacity of stores table
      await pool.query('UPDATE stores SET "currentCapacity" = "currentCapacity" - $1 WHERE "store_id" = $2', [pax, storeid]);

      // get current username 
      const usernameResult = await pool.query('SELECT name FROM users WHERE "user_id" = $1', [userid]);

      const username = usernameResult.rows[0]?.name;
      
      // upon successful reservation, send email to user
      await transporter.sendMail({
        from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
        to: 'dx8153@gmail.com',
        subject: `Reservation Confirmed at ${storename} `,
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
      })

      res.json(reserveresult.rows); // send data back as json
    }

  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to insert data' });
  }
})


// Update reservation
router.post('/update_reservation', updateReservationValidator, handleValidation, async (req, res) => {
  try {
    const { pax, time, date, firstname, lastname, specialrequest, reservationid, adultpax, childpax, storename, userid } = req.body;

    // Step 1: Get original reservation to restore its pax
    const originalRes = await pool.query(
      'SELECT "store_id", "noOfGuest" FROM reservations WHERE reservation_id = $1',
      [reservationid]
    );

    if (originalRes.rows.length === 0) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const storeId = originalRes.rows[0].store_id;
    const originalPax = originalRes.rows[0].noOfGuest;

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

    // Step 7: Fetch user name
    const usernameResult = await pool.query("SELECT name FROM users WHERE user_id = $1", [userid]);
    const username = usernameResult.rows[0]?.name || '';

    // Step 8: Send email notification
    await transporter.sendMail({
      from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
      to: 'ict2216kirby@gmail.com',
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

// node-cron for real-time reservation updates
// will run every minute
// * in order means -> minute, hour, day of month, month, day of wk
// cron.schedule('* * * * *', async () => {
//   console.log('checking for reservations...');

//   // sql query to get reservations that has been at least 1 hours since the reservation time
//   // like if the reservation time is 2pm, resrvation time +1 hours = 3pm 
//   // now() lets say 3pm -> it will return because the current time is at least 1 hr aft the reservtation

//   // if reservation time is 2pm, then +1 hours = 3pm
//   // if now() is 230pm (haven over) -> wont return
//   const result = await pool.query(
//     `
//         SELECT * FROM reservations WHERE 
//         NOW() >= ("reservationTime" + "reservationDate")::timestamp + INTERVAL '1 hour' AND status = 'Confirmed'
//       `
//   )

//   const results = result.rows;
//   console.log("=========================================================");

//   for (const r of results) {
//     // Access each reservation record
//     console.log(`Reservation ID: ${r.reservation_id}`);

//     // reservation over, so need to update status of reservation to compelted & update the current capacity in stores

//     // update status of reservation
//     await pool.query(`UPDATE reservations SET status = 'Completed' WHERE reservation_id = $1`, [r.reservation_id]);

//     // update capacity of stores (to add back the no of pax that was minus when reservation made)
//     await pool.query(`UPDATE stores SET "currentCapacity" = "currentCapacity" + $1 WHERE store_id = $2`, [r.noOfGuest, r.store_id]);
//   }


// })


// another cron for reservation reminder email
cron.schedule('0 * * * *', async () => {
  // need to convert now() to singapore timezone to compare the timing 
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
          // to: `${user[0].email}`, // this should be the legitimate flow, but will jus use our own email
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


    res.json(result.rows); // send data back as json
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
})

// query to get max capacity of store 
router.get('/maxcapacity', async (req, res) => {
  try {
    const storeid = req.query.storeid;
    const result = await pool.query(
      `
        SELECT * FROM stores WHERE "store_id" = $1
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
router.get('/get_name', async (req, res) => {
  try {
    const userid = req.query.userid;
    console.log(userid);
    const result = await pool.query(
      `SELECT * FROM users WHERE "user_id" = $1`, [userid]
    )
    res.json(result.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
})

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
    const insertQuery = `
      INSERT INTO reviews ("user_id", "store_id", rating, description)
      VALUES ($1, $2, $3, $4)
    `;

    const values = [userid, storeid, rating, review];

    const result = await pool.query(insertQuery, values);

    // console.log("Insert successful. Review ID:", result.rows[0].review_id);

    res.status(201).json({
      message: 'Review submitted successfully.',
      // review_id: result.rows[0].review_id
    });
  } catch (err) {
    console.error('Error inserting review:', err);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

module.exports = router;

