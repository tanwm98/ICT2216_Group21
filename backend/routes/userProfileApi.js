const express = require('express');
const router = express.Router();
const pool = require('../../db');

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

// Get user reservations
router.get('/reservations', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const result = await pool.query(
      `SELECT r.reservation_id, r."noOfGuest", r."reservationDate"::TEXT, r."reservationTime",
                   r."specialRequest", r.status, s."storeName"
            FROM reservations r 
            JOIN users u ON r.user_id = u.user_id
            JOIN stores s ON r.store_id = s.store_id
       WHERE r.user_id = $1 
       ORDER BY r."reservationDate" DESC, r."reservationTime" DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user reviews
router.get('/reviews', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const result = await pool.query(
      `SELECT rv.review_id, rv.rating, rv.description, u.name AS "userName", s."storeName"
        FROM reviews rv
        JOIN users u ON rv.user_id = u.user_id
        JOIN stores s ON rv.store_id = s.store_id
        WHERE rv.user_id = $1 
      ORDER BY rv.review_id DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
