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

            if (user.role === 'admin') {
                return res.redirect('/admin');
            } else if (user.role === 'user') {
                return res.redirect('/');
            } else if (user.role === 'owner') {
                return res.redirect('/resOwner');
            }
        } else {
            return res.redirect('/login?error=1');
        }
    } catch (err) {
        console.error('Login error:', err);
        return res.redirect('/login?error=1');
    }
});

// POST /register
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const hashedPassword = await argon2.hash(password);
        await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
            [name, email, hashedPassword, 'user']
        );

        // await transporter.sendMail({
        //     from: `"Your App" <${process.env.EMAIL_USER}>`,
        //     to: "shira.yuki51@gmail.com",
        //     subject: 'Welcome!',
        //     text: `Hello ${name}, welcome to our app!`,
        // });

        res.redirect('/login');
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).send('Server error');
    }
});

router.post('/signup-owner', upload.single('image'), async (req, res) => {
    const {
        ownerName,
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

    const message = `
New Restaurant Owner Signup:

👤 Owner Name: ${ownerName}
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

        res.redirect('/rOwnerReg?success=1');
    } catch (err) {
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