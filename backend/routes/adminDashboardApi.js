const express = require('express');
const pool = require('../../db'); 
const router = express.Router();

// ======== ADMIN DASHBOARD ========
router.get('/dashboard-stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
        const totalRestaurants = await pool.query('SELECT COUNT(*) FROM stores');
        const totalReservations = await pool.query('SELECT COUNT(*) FROM reservations');
        const topRatingResult = await pool.query(`
            SELECT s."storeName", ROUND(AVG(r.rating), 1) AS average_rating
            FROM reviews r
            JOIN stores s ON r.store_id = s.store_id
            GROUP BY s."storeName"
            ORDER BY average_rating DESC
            LIMIT 1;
        `);

        const topRatedRestaurant = topRatingResult.rows[0] || {};

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalRestaurants: parseInt(totalRestaurants.rows[0].count),
            totalReservations: parseInt(totalReservations.rows[0].count),
            topRatedRestaurant: topRatedRestaurant.storeName || 'N/A',
            topAverageRating: topRatedRestaurant.average_rating || 0.0
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// ======== MANAGE USERS ========
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role FROM users WHERE role != $1',
            ['admin']
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new user (default password Pass123)
router.post('/users', async (req, res) => {
    const { name, email, role } = req.body;
    try {
        const password = 'Pass123';
        const hashedPassword = await argon2.hash(password);

        await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
            [name, email, hashedPassword, role]
        );

        res.status(201).json({ message: 'User added successfully' });
    } catch (err) {
        console.error('Error adding user:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete user by id
router.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user by id
router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;

    try {
        await pool.query(
            'UPDATE users SET name = $1, email = $2, role = $3 WHERE user_id = $4',
            [name, email, role, id]
        );
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user by id
router.get('/users/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT user_id, name, email, role FROM users WHERE user_id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reset password for user by id
router.post('/users/:id/reset-password', async (req, res) => {
    const { id } = req.params;

    try {
        const defaultPassword = 'Pass123';
        const hashedPassword = await argon2.hash(defaultPassword);

        await pool.query(
            'UPDATE users SET password = $1 WHERE user_id = $2',
            [hashedPassword, id]
        );

        res.json({ message: 'Password reset to default' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== RESTAURANTS ========
// Get all restaurants
router.get('/restaurants', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                s.store_id, s."storeName", s.location,
                u.name AS "ownerName"
            FROM stores s
            JOIN users u ON s.owner_id = u.user_id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching restaurants:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users with role 'owner'
router.get('/owners', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT user_id, name FROM users WHERE role = 'owner'
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching owners:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new restaurant
router.post('/restaurants', async (req, res) => {
    const {
        owner_id, storeName, address, postalCode, location,
        cuisine, priceRange, totalCapacity,
        opening, closing
    } = req.body;

    try {
        await pool.query(`
            INSERT INTO stores (
                owner_id, "storeName", address, "postalCode", location,
                cuisine, "priceRange", "totalCapacity", "currentCapacity",
                opening, closing
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            owner_id, storeName, address, postalCode, location,
            cuisine, priceRange, totalCapacity, totalCapacity,
            opening, closing
        ]);
        res.json({ message: 'Restaurant added successfully' });
    } catch (err) {
        console.error('Error adding restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get restaurant by id
router.get('/restaurants/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(`
            SELECT store_id, "storeName", address, "postalCode", location,
                cuisine, "priceRange", "totalCapacity", "currentCapacity",
                opening, closing, owner_id
            FROM stores
            WHERE store_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update restaurant by id
router.put('/restaurants/:id', async (req, res) => {
    const { id } = req.params;
    const {
        owner_id, storeName, address, postalCode, location,
        cuisine, priceRange, totalCapacity, opening, closing
    } = req.body;

    try {
        await pool.query(`
            UPDATE stores SET
                owner_id = $1,
                "storeName" = $2,
                address = $3,
                "postalCode" = $4,
                location = $5,
                cuisine = $6,
                "priceRange" = $7,
                "totalCapacity" = $8,
                opening = $9,
                closing = $10
            WHERE store_id = $11
        `, [
            owner_id, storeName, address, postalCode, location,
            cuisine, priceRange, totalCapacity, opening, closing, id
        ]);

        res.json({ message: 'Restaurant updated successfully' });
    } catch (err) {
        console.error('Error updating restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete restaurant by id
router.delete('/restaurants/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('DELETE FROM stores WHERE store_id = $1', [id]);
        res.json({ message: 'Restaurant deleted successfully' });
    } catch (err) {
        console.error('Error deleting restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== REVIEWS ========
router.get('/reviews', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                rv.review_id, rv.rating, rv.description,
                u.name AS userName,
                s."storeName"
            FROM reviews rv
            JOIN users u ON rv.user_id = u.user_id
            JOIN stores s ON rv.store_id = s.store_id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reviews:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== RESERVATIONS ========
router.get('/reservations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.reservation_id,
        r."noOfGuest",
        r."reservationDate"::TEXT,
        r."reservationTime",
        r."specialRequest",
        r.status,
        u.name AS "userName",
        s."storeName" AS "restaurantName"
      FROM reservations r
      JOIN users u ON r.user_id = u.user_id
      JOIN stores s ON r.store_id = s.store_id
      WHERE r."reservationDate"::DATE >= CURRENT_DATE
      ORDER BY r."reservationDate" DESC, r."reservationTime" DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

router.put('/reservations/:id/confirm', async (req, res) => {
    try {
        const reservationId = req.params.id;

        const result = await pool.query(
            `UPDATE reservations SET status = 'confirmed' WHERE reservation_id = $1 RETURNING *`,
            [reservationId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        res.json({ message: 'Reservation confirmed', reservation: result.rows[0] });
    } catch (err) {
        console.error('Error confirming reservation:', err);
        res.status(500).json({ error: 'Failed to confirm reservation' });
    }
});


module.exports = router;