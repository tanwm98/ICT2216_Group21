const pool = require('../../db');
const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const handleValidation = require('../middleware/handleHybridValidation'); // adjust path if needed

// ========== GET LOCATIONS ==========
router.get('/available_locations', async (req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT location FROM stores ORDER BY location`);
    res.json(result.rows.map(row => row.location));
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// ========== DISPLAY ALL STORES ==========
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
    res.json(query.rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// ========== FILTER BY RESERVATION AVAILABILITY ==========
router.get(
  '/display_by_ReservationAvailability',
  [
    query('people').isInt({ min: 1 }).withMessage('People must be a positive integer'),
    query('date').isISO8601().withMessage('Date must be in YYYY-MM-DD format'),
    query('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { people, date, time } = req.query;

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
  }
);

// ========== FILTERED SEARCH ==========
router.get(
  '/display_filtered_store',
  [
    query('priceRange').optional().isIn(['$', '$$', '$$$']),
    query('reviewScoreMin').optional().isFloat({ min: 0, max: 5 }),
    query('reviewScoreMax').optional().isFloat({ min: 0, max: 5 }),
    query('cuisines').optional().matches(/^([\w\s]+,?)*$/),
    query('location').optional().trim().isString(),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const cuisines = req.query.cuisines ? req.query.cuisines.split(',') : [];
      const { priceRange, reviewScoreMin, reviewScoreMax, location } = req.query;

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
        values.push(parseFloat(reviewScoreMin) - 0.5);
        sql += ` HAVING AVG(r.rating) >= $${values.length}`;
        values.push(parseFloat(reviewScoreMax) + 0.5);
        sql += ` AND AVG(r.rating) <= $${values.length}`;
      }

      const result = await pool.query(sql, values);
      res.json(result.rows);
    } catch (err) {
      console.error('Filter error:', err);
      res.status(500).json({ error: 'Failed to fetch filtered data' });
    }
  }
);

module.exports = router;
