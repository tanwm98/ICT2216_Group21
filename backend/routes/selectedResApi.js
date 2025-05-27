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
        console.log("userid: " + userid);
        console.log("Pax: " + pax);
        console.log("time: " + time);
        console.log("date: " + date);
        console.log("storeid: " + storeid);
        const result = await pool.query('INSERT INTO reservations ("user_id", "store_id", "noOfGuest", "reservationTime", "reservationDate") VALUES ($1, $2, $3, $4, $5)', [userid, storeid, pax, time, date]);
        res.json(result.rows); // send data back as json
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to insert data' });
    }
})

module.exports = router;

