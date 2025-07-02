const express = require('express');
const router = express.Router();
const pool = require('../../db');
const argon2 = require('argon2');
const { authenticateToken, requireUser } = require('../../frontend/js/token');

const { userPasswordValidator, userNameValidator, userFirstNameValidator, userLastNameValidator, cancelReservationValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');
const { fieldLevelAccess } = require('../middleware/fieldAccessControl');

router.use(authenticateToken, requireUser);

// ======== Get user profile ======== 
router.get('/getUser', async (req, res) => {
  const userId = req.user.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const result = await pool.query(
      'SELECT name, email, firstname, lastname FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, firstname, lastname } = result.rows[0];
    res.json({ name, email, firstname, lastname });
    console.log(result)

  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// ======== Get user reservations ======== 
router.get('/reservations', async (req, res) => {
  const userId = req.user.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const result = await pool.query(
      `SELECT r.reservation_id, r.store_id, r."noOfGuest", r."reservationDate"::TEXT, r."reservationTime",
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


// ======== Get user reviews======== 
router.get('/reviews', async (req, res) => {
  const userId = req.user.userId;
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


// ======== Reset user password ======== 
router.post('/reset-password', userPasswordValidator, handleValidation, async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;
  // Ensure user is logged in when performing change password
  if (!userId) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  if (req.user.userId !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Forbidden: You can only access your own data' });
  }

  // Compare current password against saved hashed password
  let isMatch;
  let fetchedResult;
  try {
    fetchedResult = await pool.query('SELECT password FROM users WHERE user_id = $1', [userId]);
    // if no password exists for some reason
    if (fetchedResult.rows.length === 0) {
      return res.status(401).json({ error: 'Error performing password reset.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  const storedHashedPassword = fetchedResult.rows[0].password;
  try{
    isMatch = await argon2.verify(storedHashedPassword, currentPassword);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  if (!isMatch) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }


  // Length checks
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  if (!newPassword || newPassword.length > 64) {
    return res.status(400).json({ error: 'Password must be less than 64 characters long.' });
  }

  // Update to new password
  try {
    const hashedPassword = await argon2.hash(newPassword);

    await pool.query(
      'UPDATE users SET password = $1 WHERE user_id = $2',
      [hashedPassword, userId]
    );

    res.json({ message: 'Password reset successful.' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ======== Update user name ======== 
// router.put('/edit', authenticateToken, async (req, res) => {
//   const userId = req.user.userId;
//   const { name } = req.body;

//   if (!name || name.trim() === '') {
//     return res.status(400).json({ message: 'Name cannot be empty.' });
//   }

//   try {
//     await pool.query('UPDATE users SET name = $1 WHERE user_id = $2', [name.trim(), userId]);
//     res.json({ message: 'Name updated successfully.' });
//   } catch (err) {
//     console.error('Error updating name:', err);
//     res.status(500).json({ message: 'Internal server error.' });
//   }
// });
// ======== Update user profile fields ======== 
// ======== Update Username ========
router.put('/edit/username', userNameValidator, handleValidation, async (req, res) => {
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Username cannot be empty.' });
  }

  try {
    await pool.query('UPDATE users SET name = $1 WHERE user_id = $2', [name.trim(), userId]);
    res.json({ message: 'Username updated successfully.' });
  } catch (err) {
    console.error('Error updating username:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ======== Update First Name ========
router.put('/edit/firstname', userFirstNameValidator, handleValidation, async (req, res) => {
  const userId = req.user.userId;
  const { firstname } = req.body;

  if (!firstname || !firstname.trim()) {
    return res.status(400).json({ message: 'First name cannot be empty.' });
  }

  if (/\d/.test(firstname)) {
    return res.status(400).json({ message: 'First name cannot contain numbers and characters.' });
  }

  try {
    await pool.query('UPDATE users SET firstname = $1 WHERE user_id = $2', [firstname.trim(), userId]);
    res.json({ message: 'First name updated successfully.' });
  } catch (err) {
    console.error('Error updating first name:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ======== Update Last Name ========
router.put('/edit/lastname', userLastNameValidator, handleValidation, async (req, res) => {
  const userId = req.user.userId;
  const { lastname } = req.body;

  if (!lastname || !lastname.trim()) {
    return res.status(400).json({ message: 'Last name cannot be empty.' });
  }

  if (/\d/.test(lastname)) {
    return res.status(400).json({ message: 'Last name cannot contain numbers and characters.' });
  }

  try {
    await pool.query('UPDATE users SET lastname = $1 WHERE user_id = $2', [lastname.trim(), userId]);
    res.json({ message: 'Last name updated successfully.' });
  } catch (err) {
    console.error('Error updating last name:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ======== Cancel reservation ======== 
router.put('/reservations/:id/cancel', cancelReservationValidator, handleValidation, async (req, res) => {
  try {
    const reservationId = req.params.id;
    const userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: No user info found' });
    }

    // Fetch reservation info
    const result = await pool.query(
      `SELECT r.*, s."storeName"
             FROM reservations r
             JOIN stores s ON r."store_id" = s."store_id"
             WHERE r."reservation_id" = $1 AND r."user_id" = $2`,
      [reservationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reservation not found or does not belong to you' });
    }

    const reservation = result.rows[0];

    // Combine date and time into one Date object
    const reservationDateTime = new Date(`${reservation.reservationDate}T${reservation.reservationTime}`);
    const now = new Date();

    if (now >= reservationDateTime) {
      return res.status(400).json({ error: 'Cannot cancel a past or ongoing reservation' });
    }

    // Log reservation details
    console.log('User Cancellation Attempt:');
    console.log(`User ID: ${userId}`);
    console.log(`Restaurant: ${reservation.storeName}`);
    console.log(`Date: ${reservation.reservationDate}`);
    console.log(`Time: ${reservation.reservationTime}`);

    // Cancel reservation
    await pool.query(
      `UPDATE reservations SET status = 'Cancelled' WHERE reservation_id = $1`,
      [reservationId]
    );

    // Add back pax to current capacity
    await pool.query(
      `UPDATE stores SET "currentCapacity" = "currentCapacity" + $1 WHERE store_id = $2`,
      [reservation.noOfGuest, reservation.store_id]
    );

    res.json({ message: 'Reservation cancelled successfully', reservation });

  } catch (err) {
    console.error('Error during user cancellation:', err);
    res.status(500).json({ error: 'Failed to cancel reservation' });
  }
});

// edit reservation
// router.get('/edit_reservation', async (req, res) => {
//   try {
//     // get store name from the request
//     const storeName = req.query.name;
//     const location = req.query.location;
//     const reservationid = req.query.reservationid;
//     const userid = req.query.userid;

//     const result = await pool.query(`
//       SELECT * FROM stores s WHERE "storeName" = $1 AND location = $2 AND reservation_id = $3 AND r.user_id = $4
//       INNER JOIN reservations r ON r.store_id = s.store_id
//       INNER JOIN users u ON r.user_id = u.user_id
//       `
//       , [storeName, location, reservationid, userid]);
//     res.json(result.rows); // send data back as json
//   } catch (err) {
//     console.error('Error querying database:', err);
//     res.status(500).json({ error: 'Failed to fetch data' });
//   }
// });


module.exports = router;
