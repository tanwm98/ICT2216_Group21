const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const pool = require('./db');
const argon2 = require('argon2');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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
app.use('/public', express.static(path.join(__dirname, 'frontend/public')));

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
const loggedUser = require('./backend/routes/userProfileApi');
const { verify } = require('crypto');


// using the routes
app.use(homeRoutes);
app.use(selectedResRoutes);
app.use('/', authRoutes);
app.use('/api', adminDash);
app.use('/api/owner', ownerApi);
app.use(search); 
app.use('/api/user', loggedUser);

// ======== PUBLIC ROUTES ========
app.get('/', (req, res) => {
  res.redirect('/public/home.html');
});

app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/public/search.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/public/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/public/register.html'));
});

app.get('/rOwnerReg', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/public/resOwnerForm.html'));
});

app.get('/selectedRes', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/public/selectedRes.html'));
});

app.get('/request-reset', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/public/request-reset.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/public/reset-password.html'));
});


// ======== VERIFICATION REQUIRED ======== 

app.get('/admin',verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/admindashboard.html'));
});

app.get('/resOwner',verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/resOwnerdashboard.html'));
});

app.get('/profile',verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/userprofile.html'));
});

app.get('/reserveform', verifyToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/reserve.html'));
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



// =========== Route request
app.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(200).json({ message: 'If the email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600_000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [token, expires, email]
    );

    const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

    // Configure email (adjust to your email provider)
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
        from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
        to: 'shira.yuki51@gmail.com',
        subject: 'Password Reset Request',
        html: `<p>Click the link below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`,
    });

    res.status(200).json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Reset password 
app.put('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Missing token or new password' });
  }

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const hashedPassword = await argon2.hash(newPassword, { type: argon2.argon2id });

    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE reset_token = $2',
      [hashedPassword, token]
    );

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
