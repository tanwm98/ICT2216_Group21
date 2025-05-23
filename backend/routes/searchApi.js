const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
const router = express.Router();


// Route to display ALL stores
router.get('/displayallStores', async (req, res) => {
    try {
        // get store name from the request
        const storeName = req.query.name;
        const location = req.query.location;

        const result = await pool.query('SELECT * FROM stores');
        res.json(result.rows); // send data back as json
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Route to filter stores
router.get('/display_filtered_store', async (req, res) => {
    try {
        const people = parseInt(req.query.people, 10);
        const date = req.query.date; // e.g., '2025-05-23'
        const time = req.query.time; // e.g., '18:30'

        const result = await pool.query(
            `SELECT * FROM stores 
             WHERE "currentCapacity" >= $1`, //please future me of tdy and check this logic pray i succeeded
            [people]
        );

        res.json(result.rows);

    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});


module.exports = router;