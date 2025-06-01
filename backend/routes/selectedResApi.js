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

// Route to display data
router.get('/display_specific_store', async (req, res) => {
  try {
    // get store name from the request
    const storeName = req.query.name;
    const location = req.query.location;

    const result = await pool.query('SELECT * FROM stores WHERE "storeName" = $1 AND location = $2', [storeName, location]);
    res.json(result.rows); // send data back as json
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
router.get('/reserve', async (req, res) => {
  try {
    // get store name from the request
    const pax = req.query.pax;
    const time = req.query.time;
    const date = req.query.date;
    const userid = req.query.userid;
    const storeid = req.query.storeid;
    const firstname = req.query.firstname;
    const lastname = req.query.lastname;
    const specialreq = req.query.specialrequest;
    const storename = req.query.storename;

    console.log("userid: " + userid);
    console.log("Pax: " + pax);
    console.log("time: " + time);
    console.log("date: " + date);
    console.log("storeid: " + storeid);
    console.log("firstname: " + firstname);
    console.log("lastname: " + lastname);
    console.log("specialreq: " + specialreq);

    // check if reservation exist alr by same person, time and shop
    const checkExistingReservation = await pool.query(`SELECT * FROM reservations WHERE store_id = $1 AND user_id = $2 AND "reservationTime" = $3 AND "status" = 'Confirmed'`, [storeid, userid, time]);
    console.log(checkExistingReservation.rows);

    if (checkExistingReservation.rows.length > 0) {
      return res.status(400).json({ message: "You already have a reservation for that time." });
    } else {

      // insert into reservation
      const reserveresult = await pool.query('INSERT INTO reservations ("user_id", "store_id", "noOfGuest", "reservationTime", "reservationDate", "specialRequest", "first_name", "last_name") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [userid, storeid, pax, time, date, specialreq, firstname, lastname]);

      // // update current capacity of stores table
      await pool.query('UPDATE stores SET "currentCapacity" = "currentCapacity" - $1 WHERE store_id = $2', [pax, storeid]);

      // get current username 
      const usernameResult = await pool.query("SELECT name FROM users WHERE user_id = $1", [userid]);

      const username = usernameResult.rows[0]?.name;

      // upon successful reservation, send email to user
      await transporter.sendMail({
        from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
        to: 'chuaxinjing03@gmail.com',
        subject: `Reservation Confirmed at ${storename} `,
        html: `
              <p>Hello ${username},</p>
              <p>Your reservation with ${storename} is <strong>confirmed</strong>. See below for more details.</p>
              <h4>Reservation Details:</h4>
              <ul>
                  <li><strong>🏪 Restaurant:</strong> ${storename}</li>
                  <li><strong>📅 Date:</strong> ${date}</li>
                  <li><strong>🕒 Time:</strong> ${time}</li>
                  <li><strong>👥 Number of Guests:</strong> ${pax}</li>
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

// query to get max capacity of store 
router.get('/maxcapacity', async (req, res) => {
  try {
    const storeid = req.query.storeid;
    const result = await pool.query(
      `
        SELECT * FROM stores WHERE store_id = $1
      `,
      [storeid]
    );
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


router.get('/check-reservation', async (req, res) => {
  const { userid, storeid } = req.query;

  console.log("Checking reservation for user:", userid, "store:", storeid);

  try {
    const result = await pool.query(`
      SELECT * FROM reservations
      WHERE user_id = $1 AND store_id = $2
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



router.post('/add-review', async (req, res) => {
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

