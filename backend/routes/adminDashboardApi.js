const express = require('express');
const pool = require('../../db'); 
const router = express.Router();
const authenticateToken = require('../../frontend/js/token');
const nodemailer = require('nodemailer');
const multer = require('multer');
const argon2 = require('argon2');
const upload = multer();

// Set up your transporter (configure with real credentials)
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or 'SendGrid', 'Mailgun', etc.
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


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
// router.post('/restaurants', async (req, res) => {
//     const {
//         owner_id, storeName, address, postalCode, location,
//         cuisine, priceRange, totalCapacity,
//         opening, closing
//     } = req.body;

//     try {
//         await pool.query(`
//             INSERT INTO stores (
//                 owner_id, "storeName", address, "postalCode", location,
//                 cuisine, "priceRange", "totalCapacity", "currentCapacity",
//                 opening, closing
//             )
//             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//         `, [
//             owner_id, storeName, address, postalCode, location,
//             cuisine, priceRange, totalCapacity, totalCapacity,
//             opening, closing
//         ]);
//         res.json({ message: 'Restaurant added successfully' });
//     } catch (err) {
//         console.error('Error adding restaurant:', err);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });

router.post('/restaurants', upload.single('image'), async (req, res) => {
  const {
    owner_id, storeName, address, postalCode, location,
    cuisine, priceRange, totalCapacity,
    opening, closing
  } = req.body;

  console.log('FILE:', req.file); // ✅ Add this for debugging
  console.log('BODY:', req.body);

  const base64Image = req.file ? req.file.buffer.toString('base64') : null;

  try {
    await pool.query(`
      INSERT INTO stores (
        owner_id, "storeName", address, "postalCode", location,
        cuisine, "priceRange", "totalCapacity", "currentCapacity",
        opening, closing, image
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      owner_id, storeName, address, postalCode, location,
      cuisine, priceRange, totalCapacity, totalCapacity,
      opening, closing, base64Image
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
router.put('/restaurants/:id', upload.single('image'), async (req, res) => {
  const id = req.params.id;
  const {
    storeName, address, postalCode, cuisine, location,
    priceRange, totalCapacity, opening, closing, owner_id
  } = req.body;

  const imageBase64 = req.file ? req.file.buffer.toString('base64') : null;

  try {
    const result = await pool.query(`
      UPDATE stores SET
        "storeName" = $1,
        address = $2,
        "postalCode" = $3,
        cuisine = $4,
        location = $5,
        "priceRange" = $6,
        "totalCapacity" = $7,
        "currentCapacity" = $7,
        opening = $8,
        closing = $9,
        owner_id = $10,
        image = COALESCE($11, image)
      WHERE store_id = $12
    `, [
      storeName, address, postalCode, cuisine, location,
      priceRange, totalCapacity, opening, closing,
      owner_id, imageBase64, id
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
      ORDER BY r."reservationDate" DESC, r."reservationTime" DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});


// =========== CANCEL reservation =============
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


module.exports = router;