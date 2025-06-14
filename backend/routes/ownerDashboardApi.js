const express = require('express');
const pool = require('../../db');
const router = express.Router();
const authenticateToken = require('../../frontend/js/token');
const nodemailer = require('nodemailer');

// Set up your transporter (configure with real credentials)
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or 'SendGrid', 'Mailgun', etc.
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ========== GET ALL RESTAURANTS BY OWNER ==========
router.get('/restaurants',authenticateToken, async (req, res) => {
    const ownerId = req.user.userId;

    if (!ownerId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    try {
        const result = await pool.query(`
            SELECT * FROM stores
            WHERE owner_id = $1
        `, [ownerId]);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching owner restaurants:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== GET RESERVATIONS FOR OWNER'S RESTAURANTS ==========
router.get('/reservations/:ownerId',authenticateToken, async (req, res) => {
    const ownerId = req.user.userId;
    
    try {
        const result = await pool.query(`
            SELECT r.reservation_id, r."noOfGuest", r."reservationDate"::TEXT, r."reservationTime",
                   r."specialRequest", r.status, r."first_name", r."last_name", u.name AS "userName", s."storeName"
            FROM reservations r
            JOIN users u ON r.user_id = u.user_id
            JOIN stores s ON r.store_id = s.store_id
            WHERE s.owner_id = $1
            ORDER BY r."reservationDate" DESC, r."reservationTime" DESC
        `, [ownerId]);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching owner reservations:', err);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// ========== CANCEL RESERVATION ==========
// router.put('/reservations/:id/cancel', async (req, res) => {
//     try {
//         const reservationId = req.params.id;

//         const result = await pool.query(
//             `UPDATE reservations SET status = 'cancelled' WHERE reservation_id = $1 RETURNING *`,
//             [reservationId]
//         );

//         if (result.rowCount === 0) {
//             return res.status(404).json({ error: 'Reservation not found' });
//         }

//         res.json({ message: 'Reservation cancelled', reservation: result.rows[0] });
//     } catch (err) {
//         console.error('Error cancelling reservation:', err);
//         res.status(500).json({ error: 'Failed to cancel reservation' });
//     }
// });

router.put('/reservations/:id/cancel', async (req, res) => {
    try {
        const reservationId = req.params.id;

        // Fetch reservation details, user email, and store name
        const result = await pool.query(
            `SELECT r.*, u.email AS user_email, u.name AS user_name, s."storeName"
             FROM reservations r
             JOIN users u ON r."user_id" = u."user_id"
             JOIN stores s ON r."store_id" = s."store_id"
             WHERE r."reservation_id" = $1`,
            [reservationId]
        );

        if (result.rowCount === 0) {
            console.log(`No reservation found with ID ${reservationId}`);
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = result.rows[0];

        // Log reservation details
        console.log('📋 Reservation Details:');
        console.log(`User Name: ${reservation.user_name}`);
        console.log(`User Email: ${reservation.user_email}`);
        console.log(`Restaurant: ${reservation.storeName}`);
        console.log(`Date: ${reservation.reservationDate}`);
        console.log(`Time: ${reservation.reservationTime}`);
        console.log(`Guests: ${reservation.noOfGuest}`);
        console.log(`Special Request: ${reservation.specialRequest || 'None'}`);

        // Cancel the reservation
        await pool.query(
            `UPDATE reservations SET status = 'Cancelled' WHERE reservation_id = $1`,
            [reservationId]
        );

        // Format date and time
        const date = new Date(reservation.reservationDate).toLocaleDateString();
        const time = reservation.reservationTime.slice(0, 5); // HH:MM

        // Compose email
        const mailOptions = {
            from: '"Kirby Chope" <yourapp@example.com>',
            to: reservation.user_email,     // testing maybe use own email 'dx8153@gmail.com'
            subject: `Your reservation at ${reservation.storeName} has been cancelled`,
            html: `
                <p>Hello ${reservation.user_name || ''},</p>
                <p>We regret to inform you that your reservation has been <strong>cancelled</strong> by the restaurant.</p>
                <h4>Reservation Details:</h4>
                <ul>
                    <li><strong>Restaurant:</strong> ${reservation.storeName}</li>
                    <li><strong>Date:</strong> ${date}</li>
                    <li><strong>Time:</strong> ${time}</li>
                    <li><strong>Number of Guests:</strong> ${reservation.noOfGuest}</li>
                    ${reservation.specialRequest ? `<li><strong>Special Request:</strong> ${reservation.specialRequest}</li>` : ''}
                </ul>
                <p>We apologize for the inconvenience.</p>
            `
        };

        await transporter.sendMail(mailOptions)
            .then(info => {
                console.log(`Email sent to ${reservation.user_email}: ${info.response}`);
            })
            .catch(error => {
                console.error(`Failed to send email to ${reservation.user_email}:`, error);
            });

        res.json({ message: 'Reservation cancelled and email sent', reservation });

    } catch (err) {
        console.error('Error cancelling reservation:', err);
        res.status(500).json({ error: 'Failed to cancel reservation' });
    }
});


// ========== UPDATE EXISTING RESTAURANT ==========
router.put('/restaurants/:id', authenticateToken, async (req, res) => {
    const ownerId = req.user.userId;
    const restaurantId = req.params.id;
    const {
        storeName,
        address,
        postalCode,
        location,
        cuisine,
        priceRange,
        totalCapacity,
        opening,
        closing
    } = req.body;

    try {
        const result = await pool.query(`
            UPDATE stores
            SET "storeName" = $1,
                address = $2,
                "postalCode" = $3,
                location = $4,
                cuisine = $5,
                "priceRange" = $6,
                "totalCapacity" = $7,
                opening = $8,
                closing = $9
            WHERE store_id = $10 AND owner_id = $11
            RETURNING *
        `, [
            storeName, address, postalCode, location, cuisine,
            priceRange, totalCapacity, opening, closing,
            restaurantId, ownerId
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Restaurant not found or unauthorized' });
        }

        res.json({ message: 'Restaurant updated successfully', restaurant: result.rows[0] });
    } catch (err) {
        console.error('Error updating restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== GET REVIEWS FOR OWNER'S RESTAURANTS ==========
router.get('/reviews/:ownerId',authenticateToken, async (req, res) => {
    const ownerId = req.user.userId;

    try {
        const result = await pool.query(`
            SELECT rv.review_id, rv.rating, rv.description, u.name AS "userName", s."storeName"
            FROM reviews rv
            JOIN users u ON rv.user_id = u.user_id
            JOIN stores s ON rv.store_id = s.store_id
            WHERE s.owner_id = $1
            ORDER BY rv.review_id DESC
        `, [ownerId]);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching owner reviews:', err);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

module.exports = router;
