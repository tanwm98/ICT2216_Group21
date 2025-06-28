const express = require('express');
const pool = require('../../db');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../../frontend/js/token');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { sanitizeInput, sanitizeSpecificFields } = require('../middleware/sanitization');
const { upload, validateUploadedImage } = require('../middleware/fileUploadValidation');
const mime = require('mime-types');

function generateImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }
    return `/static/img/restaurants/${imageFilename}`;
}

// Set up your transporter (configure with real credentials)
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or 'SendGrid', 'Mailgun', etc.
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const { body } = require('express-validator');
const {
  userNameValidator,
  userFirstNameValidator,
  userLastNameValidator,
  updateRestaurantValidator,
  cancelReservationValidator,
  addUserValidator,
  restaurantAddValidator
} = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');

router.use(authenticateToken, requireAdmin);


// ======== ADMIN DASHBOARD ========
router.get('/dashboard-stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users WHERE role != $1', ['admin']);
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
            'SELECT user_id, name, email, role, firstname, lastname FROM users WHERE role != $1',
            ['admin']
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new user (default password Pass123)
router.post('/users', addUserValidator, handleValidation, async (req, res) => {
  const { name, email, role, fname, lname } = req.body;
  try {
    const password = 'Pass123';
    const hashedPassword = await argon2.hash(password);
    await pool.query(
      'INSERT INTO users (name, email, password, role, firstname, lastname) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, email, hashedPassword, role, fname, lname]
    );
    res.status(201).json({ message: 'User added successfully' });
  } catch (err) {
    console.error('Error adding user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user by id
// Replace the existing deleteUser route with this:
router.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Start a transaction
        await pool.query('BEGIN');

        // Delete related records first (in order of dependencies)

        // 1. Delete user's reviews
        await pool.query('DELETE FROM reviews WHERE user_id = $1', [id]);

        // 2. Delete user's reservations
        await pool.query('DELETE FROM reservations WHERE user_id = $1', [id]);

        // 3. If user is an owner, handle their restaurants
        const storesResult = await pool.query('SELECT store_id FROM stores WHERE owner_id = $1', [id]);
        if (storesResult.rows.length > 0) {
            const storeIds = storesResult.rows.map(row => row.store_id);

            // Delete reviews for these restaurants
            await pool.query('DELETE FROM reviews WHERE store_id = ANY($1)', [storeIds]);

            // Delete reservations for these restaurants
            await pool.query('DELETE FROM reservations WHERE store_id = ANY($1)', [storeIds]);

            // Delete the restaurants themselves
            await pool.query('DELETE FROM stores WHERE owner_id = $1', [id]);
        }

        // 4. Finally delete the user
        const result = await pool.query('DELETE FROM users WHERE user_id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }

        // Commit the transaction
        await pool.query('COMMIT');

        res.json({ message: 'User and all related data deleted successfully' });
    } catch (err) {
        // Rollback on error
        await pool.query('ROLLBACK');
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user by id
router.put('/users/:id', [
  userNameValidator,
  userFirstNameValidator,
  userLastNameValidator,
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['user', 'owner'])
], handleValidation, async (req, res) => {
  const { id } = req.params;
  const { name, email, role, firstname, lastname } = req.body;
  try {
    await pool.query(
      'UPDATE users SET name = $1, email = $2, role = $3, firstname = $4, lastname = $5 WHERE user_id = $6',
      [name, email, role, firstname, lastname, id]
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
        const result = await pool.query('SELECT user_id, name, email, role, firstname, lastname FROM users WHERE user_id = $1', [id]);
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

// Filename validation & Content-Disposition
router.get('/download/:filename', (req, res) => {
    const unsafeFilename = req.params.filename;
    const safeFilename = path.basename(unsafeFilename).replace(/[^\w.\-]/g, '_');

    const filePath = path.join(__dirname, '../../frontend/static/img/restaurants', safeFilename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`); // sanitization & encoding
    res.sendFile(filePath);
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

router.post('/restaurants', upload.single('image'), validateUploadedImage, restaurantAddValidator, handleValidation, async (req, res) => {
  const {
    owner_id, storeName, address, postalCode, location,
    cuisine, priceRange, totalCapacity,
    opening, closing
  } = req.body;

  console.log('FILE:', req.file); // ✅ Add this for debugging
  console.log('BODY:', req.body);

    // UPDATED: Store filename instead of base64
    const imageFilename = req.file ? req.file.filename : null;
    const altText = req.file ? `${storeName} restaurant image` : null;

    try {
        await pool.query(`
            INSERT INTO stores (
                owner_id, "storeName", address, "postalCode", location,
                cuisine, "priceRange", "totalCapacity", "currentCapacity",
                opening, closing, image_filename, image_alt_text
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            owner_id, storeName, address, postalCode, location,
            cuisine, priceRange, totalCapacity, totalCapacity,
            opening, closing, imageFilename, altText
        ]);

        res.json({ message: 'Restaurant added successfully' });
    } catch (err) {
        console.error('Error adding restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATED: Get restaurant by id with proper column names
router.get('/restaurants/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(`
            SELECT
                store_id,
                "storeName" as "storeName",
                address,
                "postalCode" as "postalCode",
                location,
                cuisine,
                "priceRange" as "priceRange",
                "totalCapacity" as "totalCapacity",
                "currentCapacity" as "currentCapacity",
                opening,
                closing,
                owner_id,
                image_filename,
                image_alt_text
            FROM stores
            WHERE store_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        const restaurant = result.rows[0];

        // Add image URL for frontend compatibility
        restaurant.imageUrl = generateImageUrl(restaurant.image_filename);

        res.json(restaurant);
    } catch (err) {
        console.error('Error fetching restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATED: Update restaurant by id with file handling
router.put('/restaurants/:id', upload.single('image'), validateUploadedImage, updateRestaurantValidator, handleValidation, async (req, res) => {
    const id = req.params.id;
    const {
        storeName, address, postalCode, cuisine, location,
        priceRange, totalCapacity, opening, closing, owner_id
    } = req.body;

    try {
        // Get current restaurant data
        const currentResult = await pool.query(
            'SELECT image_filename FROM stores WHERE store_id = $1',
            [id]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        const currentRestaurant = currentResult.rows[0];
        let imageFilename = currentRestaurant.image_filename;
        let altText = `${storeName} restaurant image`;

        // If new image uploaded
        if (req.file) {
            // Delete old image file if it exists
            if (currentRestaurant.image_filename) {
                const oldImagePath = path.join(__dirname, '../../frontend/static/img/restaurants', currentRestaurant.image_filename);
                try {
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                } catch (deleteErr) {
                    console.warn('Failed to delete old image:', deleteErr);
                }
            }
            imageFilename = req.file.filename;
        }

        await pool.query(`
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
                image_filename = $11,
                image_alt_text = $12
            WHERE store_id = $13
        `, [
            storeName, address, postalCode, cuisine, location,
            priceRange, totalCapacity, opening, closing,
            owner_id, imageFilename, altText, id
        ]);

        res.json({ message: 'Restaurant updated successfully' });
    } catch (err) {
        console.error('Error updating restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATED: Delete restaurant by id with file cleanup
router.delete('/restaurants/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Get image filename before deleting
        const result = await pool.query(
            'SELECT image_filename FROM stores WHERE store_id = $1',
            [id]
        );

        if (result.rows.length > 0 && result.rows[0].image_filename) {
            const imagePath = path.join(__dirname, '../../frontend/static/img/restaurants', result.rows[0].image_filename);
            try {
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            } catch (deleteErr) {
                console.warn('Failed to delete image file:', deleteErr);
            }
        }

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

router.put('/reservations/:id/cancel', cancelReservationValidator, handleValidation, async (req, res) => {
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
            to: reservation.user_email,
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

// module.exports = router;
module.exports = {
    upload,
    validateUploadedImage,
    router
};
