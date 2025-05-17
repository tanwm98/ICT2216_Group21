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

module.exports = router;