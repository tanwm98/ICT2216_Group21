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


// import route files
const authRoutes = require('./backend/routes/authApi')
const adminDash = require('./backend/routes/adminDashboardApi')
const ownerApi = require('./backend/routes/ownerDashboardApi');
const homeRoutes = require('./backend/routes/homeApi');
const selectedResRoutes = require('./backend/routes/selectedResApi');

// using the routes
app.use(homeRoutes);
app.use(selectedResRoutes);
app.use('/', authRoutes);
app.use('/api', adminDash);
app.use('/api/owner', ownerApi);

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
    res.json({ loggedIn: !!req.session.userId });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});