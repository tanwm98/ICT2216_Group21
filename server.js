const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const pool = require('./db'); // database module
const argon2 = require('argon2'); // For password hashing

// For session
require('dotenv').config();
const session = require('express-session');

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Session
app.get('/api/session', (req, res) => {
  res.json({ loggedIn: !!req.session.userId });
});

app.use('/html', express.static(path.join(__dirname, 'frontend/html')));
app.use('/js', express.static(path.join(__dirname, 'frontend/js')));
app.use('/common', express.static(path.join(__dirname, 'frontend/common')));
app.use('/static', express.static(path.join(__dirname, 'frontend/static')));
// app.use(express.static(path.join(__dirname, 'frontend/js'))); // dt need this but leave for now

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// import route files
const homeRoutes = require('./backend/routes/homeApi');

// using the routes
app.use(homeRoutes);

// default route for user -> can change later on
app.get('/', (req, res) => {
    res.redirect('/html/home.html');
});

// default route for admin
app.get('/admin', (req, res) => {
    res.redirect('/html/admindashboard.html');
});

app.get('/api/restaurants', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT 
        s."storeName", 
        s.location, 
        u.name AS "ownerName", 
        s.store_id
      FROM stores s
      JOIN users u ON s.owner_id = u.user_id
    `);
        res.json(result.rows); // Send result to frontend
    } catch (err) {
        console.error('Error fetching restaurants:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// default route for restaurant
app.get('/resOwner', (req, res) => {
    res.redirect('/html/resOwnerdashboard.html');
});

// Display Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/login.html'));
});

// Handle login, check user role
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);

        if (result.rows.length === 0) {
            // User not found
            return res.status(401).send('Invalid username or password');
        }

        const user = result.rows[0];

        // Use argon2 to verify the hashed password
        const isMatch = await argon2.verify(user.password, password);

        if (isMatch) {
            // Successful login
            // Check user role
            if (user.role == 'user'){
                req.session.userId = user.user_id; // save user session for change in header file used
                res.redirect('/');
            }
            else if (user.role == 'admin') {
                res.redirect('/admin');
            }
            else {
                res.redirect('/resOwner');
            }
            
            
        } else {
            res.redirect('/login?error=1');
        }
    } catch (err) {
        res.redirect('/login?error=1');
    }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// Display register page
app.get('/register', (req, res) => {
    res.redirect('/html/register.html');
});

// Handle register
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Hash the password with Argon2
        const hashedPassword = await argon2.hash(password);

        // Insert user into database
        const result = await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
            [name, email, hashedPassword, "user"]
        );

        res.redirect('/login');
    } catch (err) {
        console.error(err);  // Make sure to check full error here
        res.status(500).send('Server error');
    }
});

// to run : npx nodemon server.js -> can try nodemon server.js if it works for yall
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});