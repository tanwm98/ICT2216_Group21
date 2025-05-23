const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const pool = require('./db');
const argon2 = require('argon2');
require('dotenv').config();
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(403).send('Unauthorized');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach decoded token to request
        next();
    } catch (err) {
        return res.status(401).send('Invalid or expired token');
    }
}

// Cookie with JWT
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Session to keep user_id
const session = require('express-session');
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Serve frontend static files
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
const search = require('./backend/routes/searchApi');


// using the routes
app.use(homeRoutes);
app.use(selectedResRoutes);
app.use('/', authRoutes);
app.use('/api', adminDash);
app.use('/api/owner', ownerApi);
app.use(search); 


// ======== DEFAULT ROUTES ========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/html/home.html'));
});

app.get('/admin',verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/admindashboard.html'));
});

app.get('/resOwner',verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/resOwnerdashboard.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/register.html'));
});

app.get('/rOwnerReg',verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/resOwnerForm.html'));
});

// ======== SESSION STATUS API ========
app.get('/api/session', (req, res) => {
     const token = req.cookies.token;
    if (!token) return res.json({ loggedIn: false });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ loggedIn: true, userId: decoded.userId, role: decoded.role });
    } catch {
        res.json({ loggedIn: false });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});