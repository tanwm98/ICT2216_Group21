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

// Store in memory for email attachment (not saving to disk)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const { logAuth, logBusiness, logSystem, logSecurity } = require('../logger');


const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// POST /login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.redirect('/login?error=1');
        }

        const user = result.rows[0];
        const isMatch = await argon2.verify(user.password, password);

        if (isMatch) {
            // Create JWT token
            const token = jwt.sign(
                {
                    userId: user.user_id,
                    role: user.role,
                    name: user.name
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
            );

            // Set token in HTTP-only cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 3600000 // 1 hour
            });
            
            logAuth('login', true, {
            user_id: user.user_id,
            email: email,
            role: user.role,
            redirect_to: user.role === 'admin' ? '/admin' : user.role === 'owner' ? '/resOwner' : '/'
            }, req);

            if (user.role === 'admin') {
                return res.redirect('/admin');
            } else if (user.role === 'user') {
                return res.redirect('/');
            } else if (user.role === 'owner') {
                return res.redirect('/resOwner');
            }
        } else {
            // ?? LOG FAILED PASSWORD
            logAuth('login', false, {
                email: email,
                user_id: user.user_id,
                reason: 'invalid_password'
            }, req);
            
            // Also log as security event for multiple failed attempts tracking
            logSecurity('failed_login', 'medium', {
                email: email,
                user_id: user.user_id
            }, req);
            
            return res.redirect('/login?error=1');
        }
    } catch (err) {
        logSystem('error', 'Login process error', {
            email: email,
            error: err.message
        });
        
        console.error('Login error:', err);
        return res.redirect('/login?error=1');
    }
});

// POST /register for user
router.post('/register', async (req, res) => {
    const { name, email, password, firstname, lastname } = req.body;

    try {
        const existingUser = await pool.query('SELECT email FROM users WHERE email = $1', [email]);
        
        if (existingUser.rows.length > 0) {
            logAuth('registration', false, {
                email: email,
                reason: 'email_already_exists'
            }, req);
            
            return res.status(400).send('Email already registered');
        }

        const hashedPassword = await argon2.hash(password);
        const result = await pool.query(
            'INSERT INTO users (name, email, password, role, firstname, lastname) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id',
            [name, email, hashedPassword, 'user', firstname, lastname]
        );

        // ?? LOG SUCCESSFUL REGISTRATION
        logAuth('registration', true, {
            user_id: result.rows[0].user_id,
            email: email,
            name: name,
            role: 'user'
        }, req);

        // Also log as business event
        logBusiness('user_created', 'user', {
            user_id: result.rows[0].user_id,
            user_type: 'customer'
        }, req);

        res.redirect('/login');
    } catch (err) {
        logSystem('error', 'User registration failed', {
            email: email,
            error: err.message
        });
        
        console.error('Registration error:', err);
        res.status(500).send('Server error');
    }
});

// Owner signu
router.post('/signup-owner', upload.single('image'), async (req, res) => {
    const {
        ownerName,
        firstname,
        lastname,
        email,
        storeName,
        address,
        postalCode,
        cuisine,
        location,
        priceRange,
        totalCapacity,
        opening,
        closing,
    } = req.body;

    const imageFile = req.file;
    //console.log('📷 Uploaded File:', req.file);
    logBusiness('owner_application_submitted', 'restaurant_owner', {
        owner_name: ownerName,
        email: email,
        store_name: storeName,
        cuisine: cuisine,
        location: location,
        capacity: totalCapacity,
        has_image: !!imageFile
    }, req);
    const message = `
New Restaurant Owner Signup:

👤 Owner Name: ${ownerName}
👤 First Name: ${firstname}
👤 Last Name: ${lastname}
📧 Email: ${email}

🏪 Store Name: ${storeName}
📍 Address: ${address}
🧾 Postal Code: ${postalCode}
🍱 Cuisine: ${cuisine}
🗺️ Location: ${location}
💲 Price Range: ${priceRange}
👥 Total Capacity: ${totalCapacity}
🕒 Opening Hour: ${opening}
🕒 Closing Hour: ${closing}
    `;

    const attachments = imageFile ? [{
            filename: imageFile.originalname,
            content: imageFile.buffer,
            contentType: imageFile.mimetype
        }]: [];
        //console.log('📎 Prepared Email Attachments:', attachments);


    try {
        await transporter.sendMail({
            from: `"Restaurant Form" <${process.env.EMAIL_USER}>`,
            to: 'ict2216kirby@gmail.com',
            subject: 'New Restaurant Signup',
            text: message,
            attachments: attachments
        });
        logSystem('info', 'Owner application email sent successfully', {
            owner_name: ownerName,
            email: email
        });

        res.redirect('/rOwnerReg?success=1');
    } catch (err) {
        logSystem('error', 'Failed to send owner application email', {
            owner_name: ownerName,
            email: email,
            error: err.message
        });
        
        console.error('Error sending email:', err);
        res.redirect('/rOwnerReg?error=1');
    }
});

// GET /logout
router.get('/logout', (req, res) => {
   res.clearCookie('token');
  res.redirect('/');
});

module.exports = router;