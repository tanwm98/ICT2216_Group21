const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
const router = express.Router();

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
        // const userid = req.session[0];
        const userid = req.query.userid;
        const storeid = req.query.storeid;
        const firstname = req.query.firstname;
        const lastname = req.query.lastname;
        const specialreq = req.query.specialrequest;

        console.log("userid: " + userid);
        console.log("Pax: " + pax);
        console.log("time: " + time);
        console.log("date: " + date);
        console.log("storeid: " + storeid);
        console.log("firstname: " + firstname);
        console.log("lastname: " + lastname);
        console.log("specialreq: " + specialreq);

        const result = await pool.query('INSERT INTO reservations ("user_id", "store_id", "noOfGuest", "reservationTime", "reservationDate", "specialRequest", "first_name", "last_name") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [userid, storeid, pax, time, date, specialreq, firstname, lastname]);
        res.json(result.rows); // send data back as json
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to insert data' });
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

