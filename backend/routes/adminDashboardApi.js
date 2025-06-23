const express = require('express');
const pool = require('../../db'); 
const router = express.Router();
const nodemailer = require('nodemailer');
const multer = require('multer');
const argon2 = require('argon2');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ======================================
// SECURITY MIDDLEWARE & CONFIGURATION
// ======================================

// SECURITY: Enhanced admin authentication middleware
const verifyAdminRole = async (req, res, next) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // SECURITY: Verify admin role from database (not just token)
        const userResult = await pool.query(
            'SELECT user_id, role FROM users WHERE user_id = $1 AND role = $2',
            [decoded.userId, 'admin']
        );

        if (userResult.rows.length === 0) {
            return res.status(403).json({
                error: 'Admin access required',
                code: 'INSUFFICIENT_PRIVILEGES'
            });
        }

        req.user = decoded;
        req.adminUserId = userResult.rows[0].user_id;
        next();

    } catch (error) {
        console.error('Admin authentication error:', error);
        return res.status(401).json({
            error: 'Invalid authentication',
            code: 'INVALID_TOKEN'
        });
    }
};

// SECURITY: Apply admin verification to all routes
router.use(verifyAdminRole);

// SECURITY: Rate limiting for admin operations
const adminRateLimit = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 50; // Max 50 requests per minute

const checkRateLimit = (req, res, next) => {
    const clientId = req.adminUserId;
    const now = Date.now();

    if (!adminRateLimit[clientId]) {
        adminRateLimit[clientId] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    } else if (now > adminRateLimit[clientId].resetTime) {
        adminRateLimit[clientId] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
    } else {
        adminRateLimit[clientId].count++;
        if (adminRateLimit[clientId].count > RATE_LIMIT_MAX) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED'
            });
        }
    }
    next();
};

router.use(checkRateLimit);

// SECURITY: Secure file upload configuration for restaurant images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../frontend/static/img/restaurants');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = `restaurant-${uniqueSuffix}${extension}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const extension = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(extension)) {
        cb(null, true);
    } else {
        const error = new Error('Invalid file type. Only JPEG and PNG images allowed.');
        error.statusCode = 400;
        cb(error, false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1
    }
});

// Email transporter with security configuration
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    secure: true,
    requireTLS: true
});

// ======================================
// SECURITY HELPER FUNCTIONS
// ======================================

// SECURITY: Input validation and sanitization
const validateAndSanitize = {
    // Validate user ID
    userId: (id) => {
        const parsed = parseInt(id);
        if (isNaN(parsed) || parsed <= 0) {
            throw new Error('Invalid user ID format');
        }
        return parsed;
    },

    // Validate store ID
    storeId: (id) => {
        const parsed = parseInt(id);
        if (isNaN(parsed) || parsed <= 0) {
            throw new Error('Invalid store ID format');
        }
        return parsed;
    },

    // Validate email format
    email: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }
        return email.toLowerCase().trim();
    },

    // Sanitize string input
    string: (str, maxLength = 255) => {
        if (!str || typeof str !== 'string') {
            throw new Error('Invalid string input');
        }
        return str.replace(/[<>\"'&]/g, '').trim().substring(0, maxLength);
    },

    // Validate role
    role: (role) => {
        const validRoles = ['user', 'owner', 'admin'];
        if (!validRoles.includes(role)) {
            throw new Error('Invalid role specified');
        }
        return role;
    },

    // Validate restaurant capacity
    capacity: (capacity) => {
        const parsed = parseInt(capacity);
        if (isNaN(parsed) || parsed < 1 || parsed > 1000) {
            throw new Error('Capacity must be between 1 and 1000');
        }
        return parsed;
    }
};

// SECURITY: Generate secure image URLs
function generateSecureImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }

    const safeFilenameRegex = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i;
    if (!safeFilenameRegex.test(imageFilename)) {
        return '/static/img/restaurants/no-image.png';
    }

    return `/static/img/restaurants/${imageFilename}`;
}

// ======================================
// DASHBOARD STATISTICS
// ======================================

router.get('/dashboard-stats', async (req, res) => {
    try {
        const [totalUsers, totalRestaurants, totalReservations, topRating] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users WHERE role != $1', ['admin']),
            pool.query('SELECT COUNT(*) FROM stores'),
            pool.query('SELECT COUNT(*) FROM reservations'),
            pool.query(`
                SELECT s."storeName", ROUND(AVG(r.rating), 1) AS average_rating
                FROM reviews r
                JOIN stores s ON r.store_id = s.store_id
                GROUP BY s."storeName"
                ORDER BY average_rating DESC
                LIMIT 1
            `)
        ]);

        const topRatedRestaurant = topRating.rows[0] || {};

        const stats = {
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalRestaurants: parseInt(totalRestaurants.rows[0].count),
            totalReservations: parseInt(totalReservations.rows[0].count),
            topRatedRestaurant: topRatedRestaurant.storeName || 'N/A',
            topAverageRating: topRatedRestaurant.average_rating || 0.0
        };

        // SECURITY: Add security headers
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        res.json(stats);
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

// ======================================
// USER MANAGEMENT
// ======================================

// Get all users (non-admin)
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role, firstname, lastname FROM users WHERE role != $1',
            ['admin']
        );
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Add new user
router.post('/users', async (req, res) => {
    try {
        const { name, email, role, fname, lname } = req.body;

        // SECURITY: Validate all inputs
        const validatedName = validateAndSanitize.string(name, 50);
        const validatedEmail = validateAndSanitize.email(email);
        const validatedRole = validateAndSanitize.role(role);
        const validatedFname = validateAndSanitize.string(fname, 50);
        const validatedLname = validateAndSanitize.string(lname, 50);

        // SECURITY: Check if email already exists
        const existingUser = await pool.query('SELECT email FROM users WHERE email = $1', [validatedEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // SECURITY: Strong default password
        const defaultPassword = crypto.randomBytes(12).toString('base64') + '!A1';
        const hashedPassword = await argon2.hash(defaultPassword, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1,
        });

        const result = await pool.query(
            'INSERT INTO users (name, email, password, role, firstname, lastname) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id',
            [validatedName, validatedEmail, hashedPassword, validatedRole, validatedFname, validatedLname]
        );

        const newUserId = result.rows[0].user_id;

        // Send password email (in production, should be secure email)
        await transporter.sendMail({
            from: `"Kirby Chope Admin" <${process.env.EMAIL_USER}>`,
            to: validatedEmail,
            subject: 'Your Kirby Chope Account Created',
            html: `
                <h2>Account Created</h2>
                <p>Hello ${validatedFname},</p>
                <p>Your account has been created by an administrator.</p>
                <p><strong>Temporary Password:</strong> ${defaultPassword}</p>
                <p>Please change your password after first login.</p>
                <p>Best regards,<br>Kirby Chope Team</p>
            `
        });

        res.status(201).json({ message: 'User created successfully', userId: newUserId });
    } catch (err) {
        console.error('Error adding user:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
    try {
        const userId = validateAndSanitize.userId(req.params.id);

        const result = await pool.query(
            'SELECT user_id, name, email, role, firstname, lastname FROM users WHERE user_id = $1 AND role != $2',
            [userId, 'admin']
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching user:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user
router.put('/users/:id', async (req, res) => {
    try {
        const userId = validateAndSanitize.userId(req.params.id);
        const { name, email, role, firstName, lastName } = req.body;

        // SECURITY: Validate all inputs
        const validatedName = validateAndSanitize.string(name, 50);
        const validatedEmail = validateAndSanitize.email(email);
        const validatedRole = validateAndSanitize.role(role);
        const validatedFirstName = validateAndSanitize.string(firstName, 50);
        const validatedLastName = validateAndSanitize.string(lastName, 50);

        // SECURITY: Check if user exists and is not admin
        const existingUser = await pool.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role != $2',
            [userId, 'admin']
        );

        if (existingUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or cannot modify admin users' });
        }

        // SECURITY: Check email uniqueness (excluding current user)
        const emailCheck = await pool.query(
            'SELECT user_id FROM users WHERE email = $1 AND user_id != $2',
            [validatedEmail, userId]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        await pool.query(
            'UPDATE users SET name = $1, email = $2, role = $3, firstname = $4, lastname = $5 WHERE user_id = $6',
            [validatedName, validatedEmail, validatedRole, validatedFirstName, validatedLastName, userId]
        );

        res.json({ message: 'User updated successfully' });
    } catch (err) {
        console.error('Error updating user:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const userId = validateAndSanitize.userId(req.params.id);

        // SECURITY: Prevent deletion of admin users
        const userCheck = await pool.query(
            'SELECT user_id, email, role FROM users WHERE user_id = $1 AND role != $2',
            [userId, 'admin']
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or cannot delete admin users' });
        }

        const userToDelete = userCheck.rows[0];

        // SECURITY: Begin transaction for referential integrity
        await pool.query('BEGIN');

        try {
            // Delete related records first
            await pool.query('DELETE FROM reviews WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM reservations WHERE user_id = $1', [userId]);

            // If user is owner, delete their stores
            if (userToDelete.role === 'owner') {
                await pool.query('DELETE FROM stores WHERE owner_id = $1', [userId]);
            }

            // Delete the user
            await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);

            await pool.query('COMMIT');

            res.json({ message: 'User deleted successfully' });
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (err) {
        console.error('Error deleting user:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Reset user password
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const userId = validateAndSanitize.userId(req.params.id);

        // SECURITY: Verify user exists and is not admin
        const userCheck = await pool.query(
            'SELECT email, firstname FROM users WHERE user_id = $1 AND role != $2',
            [userId, 'admin']
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found or cannot reset admin password' });
        }

        const user = userCheck.rows[0];

        // SECURITY: Generate secure temporary password
        const tempPassword = crypto.randomBytes(12).toString('base64') + '!A1';
        const hashedPassword = await argon2.hash(tempPassword, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1,
        });

        await pool.query(
            'UPDATE users SET password = $1 WHERE user_id = $2',
            [hashedPassword, userId]
        );

        // Send new password email
        await transporter.sendMail({
            from: `"Kirby Chope Admin" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'Password Reset - Kirby Chope',
            html: `
                <h2>Password Reset</h2>
                <p>Hello ${user.firstname},</p>
                <p>Your password has been reset by an administrator.</p>
                <p><strong>New Temporary Password:</strong> ${tempPassword}</p>
                <p>Please change your password after logging in.</p>
                <p>Best regards,<br>Kirby Chope Team</p>
            `
        });
        res.json({ message: 'Password reset successfully and email sent' });
    } catch (err) {
        console.error('Error resetting password:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// ======================================
// RESTAURANT MANAGEMENT
// ======================================

// Get all restaurants
router.get('/restaurants', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.store_id, s."storeName", s.location, s.cuisine,
                s.image_filename, s.image_alt_text,
                u.name AS "ownerName", u.email AS "ownerEmail"
            FROM stores s
            JOIN users u ON s.owner_id = u.user_id
        `);

        // SECURITY: Transform to include secure image URLs
        const restaurants = result.rows.map(restaurant => ({
            ...restaurant,
            imageUrl: generateSecureImageUrl(restaurant.image_filename)
        }));

        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        res.json(restaurants);
    } catch (err) {
        console.error('Error fetching restaurants:', err);
        res.status(500).json({ error: 'Failed to fetch restaurants' });
    }
});

// Get available owners
router.get('/owners', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT user_id, name, email FROM users WHERE role = 'owner' ORDER BY name
        `);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching owners:', err);
        res.status(500).json({ error: 'Failed to fetch owners' });
    }
});

// FIXED: Add new restaurant with secure file handling
router.post('/restaurants', upload.single('image'), async (req, res) => {
    try {
        const {
            owner_id, storeName, address, postalCode, location,
            cuisine, priceRange, totalCapacity, opening, closing
        } = req.body;

        // SECURITY: Validate all inputs
        const validatedOwnerId = validateAndSanitize.userId(owner_id);
        const validatedStoreName = validateAndSanitize.string(storeName, 100);
        const validatedAddress = validateAndSanitize.string(address, 200);
        const validatedPostalCode = validateAndSanitize.string(postalCode, 10);
        const validatedLocation = validateAndSanitize.string(location, 50);
        const validatedCuisine = validateAndSanitize.string(cuisine, 50);
        const validatedPriceRange = validateAndSanitize.string(priceRange, 10);
        const validatedCapacity = validateAndSanitize.capacity(totalCapacity);

        // SECURITY: Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(opening) || !timeRegex.test(closing)) {
            return res.status(400).json({ error: 'Invalid time format' });
        }

        // SECURITY: Verify owner exists and has correct role
        const ownerCheck = await pool.query(
            'SELECT user_id FROM users WHERE user_id = $1 AND role = $2',
            [validatedOwnerId, 'owner']
        );

        if (ownerCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid owner specified' });
        }

        const imageFilename = req.file ? req.file.filename : null;
        const altText = req.file ? `${validatedStoreName} restaurant image` : null;

        const result = await pool.query(`
            INSERT INTO stores (
                owner_id, "storeName", address, "postalCode", location,
                cuisine, "priceRange", "totalCapacity", "currentCapacity",
                opening, closing, image_filename, image_alt_text
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING store_id
        `, [
            validatedOwnerId, validatedStoreName, validatedAddress, validatedPostalCode,
            validatedLocation, validatedCuisine, validatedPriceRange, validatedCapacity,
            validatedCapacity, opening, closing, imageFilename, altText
        ]);

        const newStoreId = result.rows[0].store_id;


        res.status(201).json({
            message: 'Restaurant created successfully',
            storeId: newStoreId,
            imageUrl: imageFilename ? generateSecureImageUrl(imageFilename) : null
        });
    } catch (err) {
        console.error('Error adding restaurant:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create restaurant' });
    }
});

// ======================================
// CONTINUE WITH OTHER ROUTES...
// ======================================
// (Reviews, Reservations, etc. following same security patterns)

// Enhanced reservation cancellation with security
router.put('/reservations/:id/cancel', async (req, res) => {
    try {
        const reservationId = validateAndSanitize.userId(req.params.id);

        // Fetch reservation details with proper joins
        const result = await pool.query(
            `SELECT r.*, u.email AS user_email, u.name AS user_name, s."storeName"
             FROM reservations r
             JOIN users u ON r.user_id = u.user_id
             JOIN stores s ON r.store_id = s.store_id
             WHERE r.reservation_id = $1 AND r.status != 'Cancelled'`,
            [reservationId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Reservation not found or already cancelled' });
        }

        const reservation = result.rows[0];

        // Cancel the reservation
        await pool.query(
            `UPDATE reservations SET status = 'Cancelled' WHERE reservation_id = $1`,
            [reservationId]
        );

        // SECURITY: Sanitize email content
        const sanitizeForEmail = (str) => str ? str.replace(/[<>]/g, '') : '';

        const date = new Date(reservation.reservationDate).toLocaleDateString();
        const time = reservation.reservationTime.slice(0, 5);

        // Send cancellation email
        await transporter.sendMail({
            from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
            to: reservation.user_email,
            subject: `Reservation Cancelled - ${sanitizeForEmail(reservation.storeName)}`,
            html: `
                <h2>Reservation Cancelled</h2>
                <p>Hello ${sanitizeForEmail(reservation.user_name)},</p>
                <p>We regret to inform you that your reservation has been <strong>cancelled</strong> by the restaurant.</p>
                <h4>Reservation Details:</h4>
                <ul>
                    <li><strong>Restaurant:</strong> ${sanitizeForEmail(reservation.storeName)}</li>
                    <li><strong>Date:</strong> ${sanitizeForEmail(date)}</li>
                    <li><strong>Time:</strong> ${sanitizeForEmail(time)}</li>
                    <li><strong>Guests:</strong> ${reservation.noOfGuest}</li>
                </ul>
                <p>We apologize for any inconvenience caused.</p>
                <p>Best regards,<br>Kirby Chope Team</p>
            `
        });

        res.json({ message: 'Reservation cancelled successfully and notification sent' });

    } catch (err) {
        console.error('Error cancelling reservation:', err);
        if (err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to cancel reservation' });
    }
});

// Get all reservations
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
                u.email AS "userEmail",
                s."storeName" AS "restaurantName"
            FROM reservations r
            JOIN users u ON r.user_id = u.user_id
            JOIN stores s ON r.store_id = s.store_id
            ORDER BY r."reservationDate" DESC, r."reservationTime" DESC
            LIMIT 1000
        `);

        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reservations:', err);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// Get all reviews
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
            LIMIT 1000
        `);
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reviews:', err);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// ======================================
// ERROR HANDLING MIDDLEWARE
// ======================================

router.use((err, req, res, next) => {
    console.error('Admin API Error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        adminUser: req.adminUserId
    });

    if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;