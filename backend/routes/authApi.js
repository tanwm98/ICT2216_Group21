const express = require('express');
const pool = require('../../db');
const argon2 = require('argon2');

const router = express.Router();

// POST /login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);

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
            } else {
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