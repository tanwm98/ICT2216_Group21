const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
const router = express.Router();


// Route to display ALL stores
router.get('/displayallStores', async (req, res) => {
    try {
      const query = await pool.query(`
        SELECT 
          s."store_id",
          s."storeName",
          s.image,
          s.cuisine,
          s.location,
          s."priceRange",
          ROUND(AVG(r.rating), 1) AS "average_rating",
          COUNT(r.rating) AS "review_count"
          FROM stores s
          LEFT JOIN reviews r ON s."store_id" = r."store_id"
          GROUP BY s."store_id";
        `);
        res.json(query.rows); // send data back as json
    
      } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Route to filter stores
router.get('/display_by_ReservationAvailability', async (req, res) => {
    try {
        const people = parseInt(req.query.people, 10);
        const date = req.query.date; // e.g., '2025-05-23'
        const time = req.query.time; // e.g., '18:30'

        const result = await pool.query(
            `SELECT * FROM stores s
                WHERE s."currentCapacity" >= $1
                    AND NOT EXISTS (
                        SELECT 1 FROM reservations r
                        WHERE r.store_id = s.store_id
                        AND r."reservationDate" = $2
                        AND r."reservationTime" = $3
                    )`, //please future me of tdy and check this logic pray i succeeded
            [people, date, time]
        );

        res.json(result.rows);

    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});


router.get('/display_filtered_store', async (req, res) => {
  try {
    const cuisines = req.query.cuisines ? req.query.cuisines.split(',') : [];
    const priceRange = req.query.priceRange; // This is a string like "$$", "$$$"

    const values = [];
    let sql = `SELECT * FROM stores WHERE 1=1`;

    // Cuisine filter
    if (cuisines.length > 0) {
      values.push(cuisines);
      sql += ` AND cuisine = ANY($${values.length})`;
    }

    // Price filter (as string)
    if (priceRange && typeof priceRange === 'string') {
      values.push(priceRange);
      sql += ` AND "priceRange" = $${values.length}`;
    }

    // Debug logs
    console.log("Received filters:", req.query);
    console.log("Generated SQL:", sql);
    console.log("SQL values:", values);

    const result = await pool.query(sql, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Filter error:', err);
    res.status(500).json({ error: 'Failed to fetch filtered data' });
  }
});




module.exports = router;