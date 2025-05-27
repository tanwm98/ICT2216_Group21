const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
const router = express.Router();

// Route to display data ***OLD***
// router.get('/displayStores', async (req, res) => {
//     try {
//         const result = await pool.query('SELECT * FROM stores'); 
//         res.json(result.rows); // send data back as json
//     } catch (err) {
//         console.error('Error querying database:', err);
//         res.status(500).json({ error: 'Failed to fetch data' });
//     }
// });

// To count ratings and reviews, Displays all stores 
router.get('/displayStores', async (req, res) => {
  try {
    const query = await pool.query(`
      SELECT 
        s."store_id",
        s."storeName",
        s.image,
        s.cuisine,
        s.address,
        s."priceRange",
        ROUND(AVG(r.rating), 1) AS "average_rating",
        COUNT(r.rating) AS "review_count"
      FROM stores s
      LEFT JOIN reviews r ON s."store_id" = r."store_id"
      GROUP BY s."store_id";
    `);

    res.json(query.rows);

  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


module.exports = router;