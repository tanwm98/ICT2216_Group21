const express = require('express');
const router = express.Router();
const pool = require('../../db'); // Adjust path as needed

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

module.exports = router;