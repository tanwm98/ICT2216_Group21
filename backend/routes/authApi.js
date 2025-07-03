const express = require('express');
const pool = require('../../db');
const argon2 = require('argon2');
require('dotenv').config();
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { logAuth, logBusiness, logSystem, logSecurity } = require('../logger');
const { sanitizeInput } = require('../middleware/sanitization');
const { loginValidator, registerValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleValidation');
const { isBreachedPassword } = require('../utils/breachCheck');

//const AppError = require('../AppError'); 

// Secure file storage configuration for restaurant images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../frontend/static/img/restaurants');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('📁 Created directory:', uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = `restaurant-${uniqueSuffix}${extension}`;

        console.log('📄 DEBUG - Generated filename:', filename);
        cb(null, filename);
    }
});

// Enhanced file validation following Node.js best practices
const fileFilter = (req, file, cb) => {
    // Restricted to jpeg, jpg, png only as requested
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];

    const extension = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(extension)) {
        cb(null, true);
    } else {
        // Fail fast principle - immediate error for invalid file types
        const error = new Error('Invalid file type. Only JPEG and PNG images allowed.');
        error.isOperational = true;
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

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        throw new AppError('Password is required and must be a string', 400);
    }

    const minLength = 8;
    const validation = {
        isValid: password.length >= minLength,
        requirements: {
            minLength: password.length >= minLength
        }
    };

    if (!validation.isValid) {
        throw new AppError('Password does not meet security requirements', 400);
    }

    return validation;
}

// Input sanitization with validation
function sanitizeAndValidate(input, fieldName, required = true) {
    if (required && (!input || typeof input !== 'string' || input.trim().length === 0)) {
        throw new AppError(`${fieldName} is required and cannot be empty`, 400);
    }

    if (input && typeof input === 'string') {
        return input.trim();
    }

    return input;
}


// POST /login
router.post('/login', loginValidator, handleValidation, async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Fail fast validation
        if (!email || !password) {
            throw new AppError('Email and password are required', 400);
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);

        if (result.rows.length === 0) {
            logAuth('login', false, {
                email: email,
                reason: 'user_not_found'
            }, req);
            return res.redirect('/login?error=1');
        }

        const user = result.rows[0];
        const isMatch = await argon2.verify(user.password, password);

        if (isMatch) {
            // Reauthentication flag
            req.session.lastVerified = Date.now();
            // Create JWT token
            const token = jwt.sign(
                {
                    userId: user.user_id,
                    role: user.role,
                    name: user.name,
                    tokenVersion: user.token_version
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
            );

            // Set token in HTTP-only cookie with secure settings
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 3600000 // 1 hour
            });

            logAuth('login', true, {
                user_id: user.user_id,
                email: email,
                role: user.role,
                redirect_to: user.role === 'admin' ? '/admin' : user.role === 'owner' ? '/resOwner' : '/'
            }, req);

            // Role-based redirection
            if (user.role === 'admin') {
                return res.redirect('/admin');
            } else if (user.role === 'user') {
                return res.redirect('/');
            } else if (user.role === 'owner') {
                return res.redirect('/resOwner');
            }
        } else {
            logAuth('login', false, {
                email: email,
                user_id: user.user_id,
                reason: 'invalid_password'
            }, req);

            logSecurity('failed_login', 'medium', {
                email: email,
                user_id: user.user_id
            }, req);

            return res.redirect('/login?error=1');
        }
    } catch (error) {
        next(error);
    }
});

// POST /register for user
router.post('/register', registerValidator, handleValidation, async (req, res, next) => {
    try {
        let { name, email, password, firstname, lastname } = req.body;

        // Sanitize and validate inputs with fail-fast
        name = sanitizeAndValidate(name, 'Username');
        email = sanitizeAndValidate(email, 'Email').toLowerCase();
        firstname = sanitizeAndValidate(firstname, 'First name');
        lastname = sanitizeAndValidate(lastname, 'Last name');

        validatePassword(password);

        // check password not in breach
        if (await isBreachedPassword(password)) {
            logAuth('registration', false, {
                email: email,
                reason: 'breached_password'
            }, req);
            throw new AppError('Chosen password has appeared in a data breach. Please choose another.', 400);
        }

        const existingUser = await pool.query('SELECT email FROM users WHERE email = $1', [email]);

        if (existingUser.rows.length > 0) {
            logAuth('registration', false, {
                email: email,
                reason: 'email_already_exists'
            }, req);
            throw new AppError('Email already registered', 400);
        }

        const hashedPassword = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16, // 64 MB
            timeCost: 2,
            parallelism: 2,

        });

        const result = await pool.query(
            'INSERT INTO users (name, email, password, role, firstname, lastname) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id',
            [name, email, hashedPassword, 'user', firstname, lastname]
        );

        logAuth('registration', true, {
            user_id: result.rows[0].user_id,
            email: email,
            name: name,
            role: 'user'
        }, req);

        logBusiness('user_created', 'user', {
            user_id: result.rows[0].user_id,
            user_type: 'customer'
        }, req);

        res.redirect('/login?success=1');
    } catch (error) {
        next(error);
    }
});

router.post('/signup-owner', upload.single('image'), async (req, res, next) => {
    try {
        let {
            ownerName,
            firstname,
            lastname,
            email,
            password,
            confirmPassword,
            storeName,
            address,
            postalCode,
            cuisine,
            location,
            priceRange,
            capacity,
            totalCapacity,
            opening,
            closing,
        } = req.body;

        const imageFile = req.file;

        // Sanitize and validate inputs with fail-fast principle
        ownerName = sanitizeAndValidate(ownerName, 'Owner Username');
        firstname = sanitizeAndValidate(firstname, 'First name');
        lastname = sanitizeAndValidate(lastname, 'Last name');
        email = sanitizeAndValidate(email, 'Email').toLowerCase();
        storeName = sanitizeAndValidate(storeName, 'Store name');
        address = sanitizeAndValidate(address, 'Address');
        postalCode = sanitizeAndValidate(postalCode, 'Postal code');
        cuisine = sanitizeAndValidate(cuisine, 'Cuisine');
        location = sanitizeAndValidate(location, 'Location');
        priceRange = sanitizeAndValidate(priceRange, 'Price range');

        // Password validation
        if (password !== confirmPassword) {
            logAuth('owner_registration', false, {
                email: email,
                reason: 'password_mismatch'
            }, req);
            throw new AppError('Passwords do not match', 400);
        }

        // Validate password strength (throws if invalid)
        validatePassword(password);

        // check password not in breach
        if (await isBreachedPassword(password)) {
            logAuth('owner_registration', false, {
                email: email,
                reason: 'breached_password'
            }, req);
            throw new AppError('This password has appeared in a data breach. Please choose another.', 400);
        }

        // Check if email already exists BEFORE starting transaction
        const existingUser = await pool.query('SELECT email FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            logAuth('owner_registration', false, {
                email: email,
                reason: 'email_already_exists'
            }, req);
            throw new AppError('Email already registered', 400);
        }

        // Validate numeric inputs
        const capacityNum = parseInt(capacity);
        const totalCapacityNum = parseInt(totalCapacity);

        if (isNaN(capacityNum) || isNaN(totalCapacityNum)) {
            throw new AppError('Capacity values must be valid numbers', 400);
        }

        if (capacityNum > totalCapacityNum) {
            throw new AppError('Seating capacity cannot exceed total capacity', 400);
        }

        if (capacityNum < 1 || totalCapacityNum < 1) {
            throw new AppError('Capacity values must be positive numbers', 400);
        }

        // Validate time inputs
        if (!opening || !closing) {
            throw new AppError('Opening and closing hours are required', 400);
        }

        // Log the application attempt
        logBusiness('owner_application_submitted', 'restaurant_owner', {
            owner_name: ownerName,
            email: email,
            store_name: storeName,
            cuisine: cuisine,
            location: location,
            capacity: totalCapacityNum,
            has_image: !!imageFile
        }, req);

        // Start a database transaction - FIXED: Include ALL database operations
        await pool.query('BEGIN');

        try {
            // 1. Create the owner user account with SECURE password hashing
            const hashedPassword = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16, // 64 MB
                timeCost: 2,
                parallelism: 2,
            });

            const userResult = await pool.query(
                'INSERT INTO users (name, email, password, role, firstname, lastname) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id',
                [ownerName, email, hashedPassword, 'owner', firstname, lastname]
            );

            const ownerId = userResult.rows[0].user_id;

            // 2. Create the restaurant/store entry
            const storeResult = await pool.query(
                `INSERT INTO stores
                ("storeName", location, cuisine, "priceRange", address, "postalCode", "totalCapacity", "currentCapacity", opening, closing, owner_id, image_filename, image_alt_text, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING store_id`,
                [
                    storeName,
                    location,
                    cuisine,
                    priceRange,
                    address,
                    postalCode,
                    totalCapacityNum,
                    capacityNum,
                    opening,
                    closing,
                    ownerId,
                    imageFile ? imageFile.filename : null,
                    imageFile ? `${storeName} restaurant image` : null,
                    'pending'
                ]
            );

            const storeId = storeResult.rows[0].store_id;

            // COMMIT only after ALL operations succeed
            await pool.query('COMMIT');

            // 3. Send notification emails (after successful DB commit)
            try {
                // Admin notification email
                const adminMessage = `
                    New Restaurant Owner Registration - PENDING APPROVAL:

                    👤 Owner Details:
                    Name: ${ownerName} (${firstname} ${lastname})
                    Email: ${email}
                    User ID: ${ownerId}

                    🏪 Restaurant Details:
                    Store Name: ${storeName}
                    Store ID: ${storeId}
                    Address: ${address}
                    Postal Code: ${postalCode}
                    Cuisine: ${cuisine}
                    Location: ${location}
                    Price Range: ${priceRange}
                    Seating Capacity: ${capacityNum}
                    Total Capacity: ${totalCapacityNum}
                    Opening Hours: ${opening} - ${closing}
                    Image: ${imageFile ? `Uploaded (${imageFile.filename})` : 'Not provided'}

                    ⏳ Status: PENDING APPROVAL

                    🔗 Admin Action Required:
                    Please log into the admin dashboard to review and approve/reject this restaurant.
                `;

                await transporter.sendMail({
                    from: `"Kirby Chope System" <${process.env.EMAIL_USER}>`,
                    to: `<${process.env.EMAIL_USER}>`,
                    subject: `New Restaurant Registered: ${storeName}`,
                    text: adminMessage,
                });

                // Owner welcome email
                const ownerMessage = `
                    Thank you for submitting your restaurant to Kirby Chope, ${firstname}!

                    Your restaurant application has been received and is currently under review.

                    🏪 Your Restaurant Details:
                    Restaurant Name: ${storeName}
                    Location: ${location}
                    Cuisine: ${cuisine}
                    Address: ${address}

                    ⏳ Current Status: PENDING APPROVAL

                    📋 Next Steps:
                    - Our admin team will review your application within 2-3 business days
                    - You'll receive an email notification once your restaurant is approved
                    - After approval, customers can find and book your restaurant on our platform

                    📊 In the meantime:
                    - You can log into your owner dashboard to view your application status
                    - Prepare for managing reservations once approved

                    Login at: https://www.kirbychope.xyz/login

                    Thank you for choosing Kirby Chope!

                    Best regards,
                    The Kirby Chope Team
                `;

                await transporter.sendMail({
                    from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: 'Welcome to Kirby Chope - Restaurant Registration Complete',
                    text: ownerMessage,
                });
            } catch (emailError) {
                // Log email errors but don't fail the registration
                logSystem('warning', 'Email notification failed but registration succeeded', {
                    owner_id: ownerId,
                    store_id: storeId,
                    email_error: emailError.message
                });
            }

            logAuth('owner_registration', true, {
                user_id: ownerId,
                store_id: storeId,
                email: email,
                owner_name: ownerName,
                store_name: storeName
            }, req);

            logBusiness('restaurant_created', 'restaurant', {
                store_id: storeId,
                owner_id: ownerId,
                store_name: storeName,
                status: 'pending'
            }, req);

            logSystem('info', 'Owner application processed successfully', {
                owner_id: ownerId,
                store_id: storeId,
                owner_name: ownerName,
                email: email,
                store_name: storeName
            });

            res.redirect('/rOwnerReg?success=1');

        } catch (dbError) {
            // Rollback transaction on any database error
            await pool.query('ROLLBACK');
            throw dbError;
        }

    } catch (err) {
        // Clean up uploaded file if error occurred
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (fileErr) {
                console.error('File cleanup error:', fileErr);
            }
        }

        logSystem('error', 'Failed to process owner application', {
            owner_name: req.body.ownerName,
            email: req.body.email,
            store_name: req.body.storeName,
            error: err.message,
            stack: err.stack
        });

        next(err);
    }
});

// POST /logout (preferred)
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// GET /logout (backward compatibility)
router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

router.use((err, req, res, next) => {
    // Log error details
    logSystem('error', 'Request error occurred', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Handle operational errors with proper error messages
    if (err.isOperational) {
        if (req.originalUrl.includes('/signup-owner')) {
            return res.redirect(`/rOwnerReg?error=${encodeURIComponent(err.message)}`);
        } else if (req.originalUrl.includes('/register')) {
            return res.redirect(`/register?error=${encodeURIComponent(err.message)}`);
        } else if (req.originalUrl.includes('/login')) {
            return res.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}`);
        }
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    console.error('Unexpected error:', err);

    if (req.originalUrl.includes('/signup-owner')) {
        return res.redirect(`/rOwnerReg?error=${encodeURIComponent('Registration failed. Please try again.')}`);
    } else if (req.originalUrl.includes('/register')) {
        return res.redirect(`/register?error=${encodeURIComponent('Registration failed. Please try again.')}`);
    } else if (req.originalUrl.includes('/login')) {
        return res.redirect(`/login?error=${encodeURIComponent('Login failed. Please try again.')}`);
    }

    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;