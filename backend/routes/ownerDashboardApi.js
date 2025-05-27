const express = require('express');
const pool = require('../../db');
const router = express.Router();
const authenticateToken = require('../../frontend/js/token');

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
                   r."specialRequest", r.status, u.name AS "userName", s."storeName"
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

// ========== CONFIRM RESERVATION ==========
router.put('/reservations/:id/cancel', async (req, res) => {
    try {
        const reservationId = req.params.id;

        const result = await pool.query(
            `UPDATE reservations SET status = 'cancelled' WHERE reservation_id = $1 RETURNING *`,
            [reservationId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        res.json({ message: 'Reservation cancelled', reservation: result.rows[0] });
    } catch (err) {
        console.error('Error cancelling reservation:', err);
        res.status(500).json({ error: 'Failed to cancel reservation' });
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
