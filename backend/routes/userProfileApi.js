const express = require('express');
const router = express.Router();
const db = require('../../db'); // Using the enhanced db setup with Knex
const argon2 = require('argon2');
const { authenticateToken, requireUser } = require('../../frontend/js/token');

const { userPasswordValidator, userNameValidator, userFirstNameValidator, userLastNameValidator, cancelReservationValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');
const { encodeHTML } = require('../middleware/sanitization');
const { fieldLevelAccess } = require('../middleware/fieldAccessControl');
const { isBreachedPassword } = require('../middleware/breachCheck');

router.use(authenticateToken, requireUser);

// ======== Get user profile ========
router.get('/getUser', async (req, res) => {
  const userId = req.user.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const user = await db('users')
      .select('name', 'email', 'firstname', 'lastname')
      .where('user_id', userId)
      .first();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, email, firstname, lastname } = user;
    res.json({ name, email, firstname, lastname });
    console.log('User data fetched:', user);

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
    const reservations = await db('reservations as r')
      .join('users as u', 'r.user_id', 'u.user_id')
      .join('stores as s', 'r.store_id', 's.store_id')
      .select(
        'r.reservation_id',
        'r.store_id',
        'r.noOfGuest',
        db.raw('r."reservationDate"::TEXT as "reservationDate"'),
        'r.reservationTime',
        'r.specialRequest',
        'r.status',
        's.storeName'
      )
      .where('r.user_id', userId)
      .orderBy([
        { column: 'r.reservationDate', order: 'desc' },
        { column: 'r.reservationTime', order: 'desc' }
      ]);

    res.json(reservations);
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ======== Get user reviews ========
router.get('/reviews', async (req, res) => {
  const userId = req.user.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  try {
    const reviews = await db('reviews as rv')
      .join('users as u', 'rv.user_id', 'u.user_id')
      .join('stores as s', 'rv.store_id', 's.store_id')
      .select(
        'rv.review_id',
        'rv.rating',
        'rv.description',
        'u.name as userName',
        's.storeName'
      )
      .where('rv.user_id', userId)
      .orderBy('rv.review_id', 'desc');

    res.json(reviews);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ======== Authenticated User Change password ========
router.post('/reset-password', userPasswordValidator, handleValidation, async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  // Ensure user is logged in when performing change password
  if (!userId) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  // Compare current password against saved hashed password
  let isMatch;
  let user;

  try {
    user = await db('users')
      .select('password')
      .where('user_id', userId)
      .first();

    // if no password exists for some reason
    if (!user) {
      return res.status(401).json({ error: 'Error performing password reset.' });
    }
  } catch (error) {
    console.error('Error fetching user password:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  const storedHashedPassword = user.password;
  try {
    isMatch = await argon2.verify(storedHashedPassword, currentPassword);
  } catch (error) {
    console.error('Error verifying password:', error);
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

  // Check if password appeared in breach database
  if (await isBreachedPassword(newPassword)) {
    return res.status(400).json({
      error: 'Password has been flagged in breach databases. Please choose another password.'
    });
  }

  // Update to new password
  try {
    const hashedPassword = await argon2.hash(newPassword);

    // Increment token_version to invalidate old tokens
    await db('users')
      .where('user_id', userId)
      .update({
        password: hashedPassword,
        token_version: db.raw('token_version + 1')
      });

    res.clearCookie('token');
    res.json({ message: 'Password reset successful.' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======== Update Username ========
router.put('/edit/username', userNameValidator, handleValidation, async (req, res) => {
  const userId = req.user.userId;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Username cannot be empty.' });
  }

  try {
    const sanitizedName = encodeHTML(name.trim());
    await db('users')
      .where('user_id', userId)
      .update({ name: sanitizedName });

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
    const sanitizedFirstname = encodeHTML(firstname.trim());
    await db('users')
      .where('user_id', userId)
      .update({ firstname: sanitizedFirstname });

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
    const sanitizedLastname = encodeHTML(lastname.trim());
    await db('users')
      .where('user_id', userId)
      .update({ lastname: sanitizedLastname });

    res.json({ message: 'Last name updated successfully.' });
  } catch (err) {
    console.error('Error updating last name:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ======== Get reservation for editing ========
router.get('/reservations/:id/edit', async (req, res) => {
  const reservationId = req.params.id;
  const userId = req.user.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No user info found' });
  }

  try {
    const reservation = await db('reservations as r')
      .join('stores as s', 'r.store_id', 's.store_id')
      .select(
        'r.reservation_id',
        'r.store_id',
        'r.noOfGuest',
        'r.reservationDate',
        'r.reservationTime',
        'r.specialRequest',
        'r.status',
        's.storeName',
        's.location',
        's.maxCapacity',
        's.currentCapacity'
      )
      .where('r.reservation_id', reservationId)
      .where('r.user_id', userId)
      .where('r.status', '!=', 'Cancelled')
      .first();

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found or does not belong to you' });
    }

    const reservationDateTime = new Date(`${reservation.reservationDate}T${reservation.reservationTime}`);
    const now = new Date();

    if (now >= reservationDateTime) {
      return res.status(400).json({ error: 'Cannot edit a past or ongoing reservation' });
    }

    res.json(reservation);
  } catch (err) {
    console.error('Error fetching reservation for edit:', err);
    res.status(500).json({ error: 'Failed to fetch reservation' });
  }
});

// ======== Update reservation ========
router.put('/reservations/:id', async (req, res) => {
  const reservationId = req.params.id;
  const userId = req.user.userId;
  const { noOfGuest, reservationDate, reservationTime, specialRequest } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No user info found' });
  }

  // Input validation
  if (!noOfGuest || noOfGuest < 1 || noOfGuest > 20) {
    return res.status(400).json({ error: 'Number of guests must be between 1 and 20' });
  }

  if (!reservationDate || !reservationTime) {
    return res.status(400).json({ error: 'Reservation date and time are required' });
  }

  // Validate future date
  const newReservationDateTime = new Date(`${reservationDate}T${reservationTime}`);
  const now = new Date();

  if (newReservationDateTime <= now) {
    return res.status(400).json({ error: 'Reservation must be in the future' });
  }

  try {
    const result = await db.transaction(async (trx) => {
      // Fetch current reservation
      const currentReservation = await trx('reservations as r')
        .join('stores as s', 'r.store_id', 's.store_id')
        .select(
          'r.*',
          's.storeName',
          's.maxCapacity',
          's.currentCapacity'
        )
        .where('r.reservation_id', reservationId)
        .where('r.user_id', userId)
        .where('r.status', '!=', 'Cancelled')
        .first();

      if (!currentReservation) {
        throw new Error('Reservation not found or does not belong to you');
      }

      const currentDateTime = new Date(`${currentReservation.reservationDate}T${currentReservation.reservationTime}`);

      if (now >= currentDateTime) {
        throw new Error('Cannot edit a past or ongoing reservation');
      }

      // Check if date/time changed - need to validate availability
      const dateTimeChanged = (
        reservationDate !== currentReservation.reservationDate ||
        reservationTime !== currentReservation.reservationTime
      );

      if (dateTimeChanged) {
        // Check for conflicting reservations at new time slot
        const conflictingReservation = await trx('reservations')
          .where('store_id', currentReservation.store_id)
          .where('reservationDate', reservationDate)
          .where('reservationTime', reservationTime)
          .where('status', '!=', 'Cancelled')
          .where('reservation_id', '!=', reservationId)
          .first();

        if (conflictingReservation) {
          throw new Error('Time slot is no longer available');
        }
      }

      // Calculate capacity changes
      const guestDifference = noOfGuest - currentReservation.noOfGuest;

      // Check if store can accommodate the change
      if (guestDifference > 0) {
        const availableCapacity = currentReservation.maxCapacity - currentReservation.currentCapacity;
        if (guestDifference > availableCapacity) {
          throw new Error(`Cannot accommodate ${guestDifference} additional guests. Available capacity: ${availableCapacity}`);
        }
      }

      // Update reservation
      await trx('reservations')
        .where('reservation_id', reservationId)
        .update({
          noOfGuest: noOfGuest,
          reservationDate: reservationDate,
          reservationTime: reservationTime,
          specialRequest: specialRequest ? encodeHTML(specialRequest.trim()) : null,
          updated_at: db.fn.now()
        });

      // Update store capacity if guest count changed
      if (guestDifference !== 0) {
        await trx('stores')
          .where('store_id', currentReservation.store_id)
          .update({
            currentCapacity: db.raw('?? - ?', ['currentCapacity', guestDifference])
          });
      }

      // Fetch updated reservation for response
      const updatedReservation = await trx('reservations as r')
        .join('stores as s', 'r.store_id', 's.store_id')
        .select(
          'r.*',
          's.storeName'
        )
        .where('r.reservation_id', reservationId)
        .first();

      return updatedReservation;
    });

    res.json({
      message: 'Reservation updated successfully',
      reservation: result
    });

  } catch (err) {
    console.error('Error updating reservation:', err);

    // Handle custom error messages from transaction
    if (err.message.includes('Reservation not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('Cannot edit a past')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message.includes('Time slot is no longer available')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message.includes('Cannot accommodate')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

// ======== Cancel reservation ========
router.put('/reservations/:id/cancel', cancelReservationValidator, handleValidation, async (req, res) => {
  const reservationId = req.params.id;
  const userId = req.user.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No user info found' });
  }

  try {
    // Use Knex transaction for atomic operations
    const result = await db.transaction(async (trx) => {
      // Fetch reservation with store information
      const reservation = await trx('reservations as r')
        .join('stores as s', 'r.store_id', 's.store_id')
        .select(
          'r.*',
          's.storeName'
        )
        .where('r.reservation_id', reservationId)
        .where('r.user_id', userId)
        .first();

      if (!reservation) {
        throw new Error('Reservation not found or does not belong to you');
      }

      const reservationDateTime = new Date(`${reservation.reservationDate}T${reservation.reservationTime}`);
      const now = new Date();

      if (now >= reservationDateTime) {
        throw new Error('Cannot cancel a past or ongoing reservation');
      }

      // Cancel reservation
      await trx('reservations')
        .where('reservation_id', reservationId)
        .update({ status: 'Cancelled' });

      // Add back pax to current capacity
      await trx('stores')
        .where('store_id', reservation.store_id)
        .update({
          currentCapacity: db.raw('?? + ?', ['currentCapacity', reservation.noOfGuest])
        });

      return reservation;
    });

    res.json({
      message: 'Reservation cancelled successfully',
      reservation: result
    });

  } catch (err) {
    console.error('Error during user cancellation:', err);

    // Handle custom error messages from transaction
    if (err.message.includes('Reservation not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('Cannot cancel a past')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to cancel reservation' });
  }
});

module.exports = router;