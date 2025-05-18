const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const pool = require('./db');
const argon2 = require('argon2');
require('dotenv').config();
const session = require('express-session');

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Serve frontend static files
app.use('/html', express.static(path.join(__dirname, 'frontend/html')));
app.use('/js', express.static(path.join(__dirname, 'frontend/js')));
app.use('/common', express.static(path.join(__dirname, 'frontend/common')));
app.use('/static', express.static(path.join(__dirname, 'frontend/static')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
const homeRoutes = require('./backend/routes/homeApi');
app.use(homeRoutes);

// ======== DEFAULT ROUTES ========
app.get('/', (req, res) => {
    res.redirect('/html/home.html');
});

app.get('/admin', (req, res) => {
    res.redirect('/html/admindashboard.html');
});

app.get('/resOwner', (req, res) => {
    res.redirect('/html/resOwnerdashboard.html');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/login.html'));
});

app.get('/register', (req, res) => {
    res.redirect('/html/register.html');
});

// ======== SESSION STATUS API ========
app.get('/api/session', (req, res) => {
    res.json({ loggedIn: !! req.session.userId });
});

// ======== USERS API ========
app.get('/api/users', async (req, res) => {
    const currentUserId = req.session.userId; // match the key here
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role FROM users WHERE user_id != $1',
            [currentUserId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/users', async (req, res) => {
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

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/users/:id', async (req, res) => {
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

app.get('/api/users/:id', async (req, res) => {
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

app.post('/api/users/:id/reset-password', async (req, res) => {
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

// ======== RESTAURANTS API ========
app.get('/api/restaurants', async (req, res) => {
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

// ======== RESERVATIONS API ========
app.get('/api/reservations', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                r.reservation_id, r.noOfGuest, r.reservationDate, r.status,
                u.name AS userName,
                s."storeName"
            FROM reservations r
            JOIN users u ON r.user_id = u.user_id
            JOIN stores s ON r.store_id = s.store_id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reservations:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== REVIEWS API ========
app.get('/api/reviews', async (req, res) => {
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

// ======== LOGIN / LOGOUT / REGISTER ========
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);

        if (result.rows.length === 0) {
            res.redirect('/login?error=1');
        }

        const user = result.rows[0];
        const isMatch = await argon2.verify(user.password, password);

        if (isMatch) {
            req.session.userId = user.user_id;

            if (user.role === 'admin') {
                res.redirect('/admin');
            } else if (user.role === 'user') {
                res.redirect('/');
            } else {
                res.redirect('/resOwner');
            }
        } else {
            res.redirect('/login?error=1');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.redirect('/login?error=1');
    }
});

app.post('/register', async (req, res) => {
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

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
