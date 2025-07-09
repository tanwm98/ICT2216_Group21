const express = require('express');
const db = require('../../db');
const router = express.Router();
const { authenticateToken, requireOwner } = require('../../frontend/js/token');
const nodemailer = require('nodemailer');
const { updateRestaurantValidator, cancelReservationValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');
const { decodeHtmlEntities, debugDecode } = require('../middleware/htmlDecoder');
const { encodeHTML, sanitizeForEmail } = require('../middleware/sanitization');
const { fieldLevelAccess } = require('../middleware/fieldAccessControl');

// Set up your transporter (configure with real credentials)
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or 'SendGrid', 'Mailgun', etc.
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

router.use(authenticateToken, requireOwner);

// ========== GET ALL RESTAURANTS BY OWNER ==========
router.get('/restaurants', async (req, res) => {
    const ownerId = req.user.userId;

    if (!ownerId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        const restaurants = await db('stores')
            .select('*')
            .where('owner_id', ownerId);

        res.json(restaurants);
    } catch (err) {
        console.error('Error fetching owner restaurants:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== GET RESERVATIONS FOR OWNER'S RESTAURANTS ==========
router.get('/reservations/:ownerId', async (req, res) => {
    const ownerId = req.user.userId;

    try {
        const reservations = await db('reservations as r')
            .join('users as u', 'r.user_id', 'u.user_id')
            .join('stores as s', 'r.store_id', 's.store_id')
            .select(
                'r.reservation_id',
                'r.noOfGuest',
                db.raw('r."reservationDate"::TEXT as "reservationDate"'),
                'r.reservationTime',
                'r.specialRequest',
                'r.status',
                'r.first_name',
                'r.last_name',
                'u.name as userName',
                's.storeName'
            )
            .where('s.owner_id', ownerId)
            .orderBy([
                { column: 'r.reservationDate', order: 'desc' },
                { column: 'r.reservationTime', order: 'desc' }
            ]);

        const decodedResults = reservations.map(r => ({
            ...r,
            specialRequest: debugDecode(r.specialRequest || '')
        }));

        res.json(decodedResults);
    } catch (err) {
        console.error('Error fetching owner reservations:', err);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// ========== CANCEL RESERVATION ==========
router.put('/reservations/:id/cancel', authenticateToken, cancelReservationValidator, handleValidation, async (req, res) => {
    try {
        const reservationId = req.params.id;

        const reservation = await db('reservations as r')
            .join('users as u', 'r.user_id', 'u.user_id')
            .join('stores as s', 'r.store_id', 's.store_id')
            .select(
                'r.*',
                'u.email as user_email',
                'u.name as user_name',
                's.storeName'
            )
            .where('r.reservation_id', reservationId)
            .first();

        if (!reservation) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // Log reservation details
        console.log('Reservation Details:');
        console.log(`User Name: ${reservation.user_name}`);
        console.log(`User Email: ${reservation.user_email}`);
        console.log(`Restaurant: ${reservation.storeName}`);
        console.log(`Date: ${reservation.reservationDate}`);
        console.log(`Time: ${reservation.reservationTime}`);
        console.log(`Guests: ${reservation.noOfGuest}`);
        console.log(`Special Request: ${reservation.specialRequest || 'None'}`);

        await db('reservations')
            .where('reservation_id', reservationId)
            .update({ status: 'Cancelled' });

        const date = new Date(reservation.reservationDate).toLocaleDateString();
        const time = reservation.reservationTime.slice(0, 5);

        const mailOptions = {
            from: `"Kirby Chope" <${sanitizeForEmail(process.env.EMAIL_USER)}>`,
            to: reservation.user_email,
            subject: `Your reservation at ${sanitizeForEmail(reservation.storeName)} has been cancelled`,
            html: `
                <p>Hello ${sanitizeForEmail(reservation.user_name) || ''},</p>
                <p>Your reservation has been <strong>cancelled</strong> by the restaurant.</p>
                <ul>
                    <li><strong>Restaurant:</strong> ${sanitizeForEmail(reservation.storeName)}</li>
                    <li><strong>Date:</strong> ${date}</li>
                    <li><strong>Time:</strong> ${time}</li>
                    <li><strong>Guests:</strong> ${reservation.noOfGuest}</li>
                    ${reservation.specialRequest ? `<li><strong>Special Request:</strong> ${sanitizeForEmail(reservation.specialRequest)}</li>` : ''}
                </ul>
                <p>We apologize for the inconvenience.</p>
            `
        };

        await transporter.sendMail(mailOptions)
            .then(info => console.log(`Email sent: ${info.response}`))
            .catch(error => console.error(`Email failed:`, error));

        res.json({ message: 'Reservation cancelled and email sent', reservation });

    } catch (err) {
        console.error('Error cancelling reservation:', err);
        res.status(500).json({ error: 'Failed to cancel reservation' });
    }
});


// ========== UPDATE EXISTING RESTAURANT ==========
router.put('/restaurants/:id', fieldLevelAccess([
    'storeName',
    'address',
    'postalCode',
    'location',
    'cuisine',
    'priceRange',
    'totalCapacity',
    'opening',
    'closing'
]), authenticateToken, updateRestaurantValidator, handleValidation, async (req, res) => {
    const ownerId = req.user.userId;
    const restaurantId = req.params.id;
    const { storeName, address, postalCode, location, cuisine, priceRange, totalCapacity, opening, closing } = req.body;

    try {
        const updatedRestaurant = await db('stores')
            .where('store_id', restaurantId)
            .where('owner_id', ownerId)
            .update({
                storeName: storeName,
                address: address,
                postalCode: postalCode,
                location: location,
                cuisine: cuisine,
                priceRange: priceRange,
                totalCapacity: totalCapacity,
                opening: opening,
                closing: closing
            })
            .returning('*');

        if (updatedRestaurant.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found or unauthorized' });
        }

        res.json({ message: 'Restaurant updated successfully', restaurant: updatedRestaurant[0] });
    } catch (err) {
        console.error('Error updating restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== GET REVIEWS FOR OWNER'S RESTAURANTS ==========
router.get('/reviews/:ownerId', async (req, res) => {
  const ownerId = req.user.userId;

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
      .where('s.owner_id', ownerId)
      .orderBy('rv.review_id', 'desc');

    // Decode HTML entities
    const decodedRows = reviews.map(review => ({
      ...review,
      description: debugDecode(review.description)
    }));

    res.json(decodedRows);
  } catch (err) {
    console.error('Error fetching owner reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

router.get('/restaurant-status', authenticateToken, requireOwner, async (req, res) => {
    try {
        const ownerId = req.user.userId;

        const restaurants = await db('stores')
            .select(
                'store_id',
                'storeName',
                'status',
                'submitted_at',
                'approved_at',
                'rejection_reason'
            )
            .where('owner_id', ownerId)
            .orderBy('submitted_at', 'desc');

        res.json(restaurants);
    } catch (error) {
        console.error('Error fetching restaurant status:', error);
        res.status(500).json({ error: 'Failed to fetch restaurant status' });
    }
});

module.exports = router;
