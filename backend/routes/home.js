const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
const router = express.Router();

// Route to display data
router.get('/displayUsers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users'); 
        res.json(result.rows); // send data back as json
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

module.exports = router;