const pool = require('../../db');  // import connection string from db.js
const express = require('express');

// const app = express();
const router = express.Router();

// Route to get locations
router.get('/available_locations', async (req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT location FROM stores ORDER BY location`);
    res.json(result.rows.map(row => row.location));
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});


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
            `
            SELECT s.*, 
                   AVG(rv.rating)::numeric(2,1) AS "average_rating", 
                   COUNT(rv."store_id") AS "review_count"
            FROM stores s
            LEFT JOIN reviews rv ON s."store_id" = rv."store_id"
            WHERE s."currentCapacity" >= $1
              AND NOT EXISTS (
                    SELECT 1 FROM reservations r
                    WHERE r.store_id = s.store_id
                      AND r."reservationDate" = $2
                      AND r."reservationTime" = $3
              )
            GROUP BY s.store_id
            `,
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
    const priceRange = req.query.priceRange;
    const reviewScoreMin = parseFloat(req.query.reviewScoreMin);
    const reviewScoreMax = parseFloat(req.query.reviewScoreMax);
    const location = req.query.location;

    const values = [];
    let sql = `
      SELECT s.*, AVG(r.rating)::numeric(2,1) AS "average_rating", COUNT(r."store_id") AS "review_count"
      FROM stores s
      LEFT JOIN reviews r ON s."store_id" = r."store_id"
      WHERE 1=1
    `;

    if (cuisines.length > 0) {
      values.push(cuisines);
      sql += ` AND s.cuisine = ANY($${values.length})`;
    }

    if (priceRange) {
      values.push(priceRange);
      sql += ` AND s."priceRange" = $${values.length}`;
    }

    if (location) {
      values.push(location);
      sql += ` AND s.location = $${values.length}`;
    }

    sql += ` GROUP BY s."store_id"`;

    if (!isNaN(reviewScoreMin) && !isNaN(reviewScoreMax)) {
      values.push(reviewScoreMin - 0.5);
      sql += ` HAVING AVG(r.rating) >= $${values.length}`;
      values.push(reviewScoreMax + 0.5);
      sql += ` AND AVG(r.rating) <= $${values.length}`;
    }

    console.log("SQL:", sql);
    console.log("Values:", values);

    const result = await pool.query(sql, values);
    res.json(result.rows);
  } catch (err) {

    console.error('Filter error:', err);
    res.status(500).json({ error: 'Failed to fetch filtered data' });
  }
});





module.exports = router;