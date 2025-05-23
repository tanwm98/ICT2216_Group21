const express = require('express');
const pool = require('../../db');
const argon2 = require('argon2');
require('dotenv').config();
const nodemailer = require('nodemailer');

const router = express.Router();

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
            req.session.userId = user.user_id;
            req.session.role = user.role;

            if (user.role === 'admin') {
                return res.redirect('/admin');
            } else if (user.role === 'user') {
                return res.redirect('/');
            } else if (user.role === 'owner'){
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

// GET /logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

module.exports = router;