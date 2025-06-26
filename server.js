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
const logger = require('./backend/logger');
const { authenticateToken, requireAdmin, requireOwner, requireUser } = require('./frontend/js/token');

if (process.env.NODE_ENV === 'production') {
  console.log = () => {};
  console.info = () => {};
  // Keep console.error and console.warn for debugging production issues
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
app.use(search);

app.get('/api/session', (req, res) => {
     const token = req.cookies.token;
    if (!token) return res.json({ loggedIn: false });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({
            loggedIn: true,
            userId: decoded.userId,
            role: decoded.role,
            permissions: {
                canAccessAdmin: decoded.role === 'admin',
                canAccessOwner: ['owner', 'admin'].includes(decoded.role),
                canAccessUser: ['user', 'owner', 'admin'].includes(decoded.role)
            }
        });
    } catch {
        res.json({ loggedIn: false });
    }
});

app.get('/api/session/validation-errors', (req, res) => {
  const errors = req.session.validationErrors || [];
  req.session.validationErrors = null;
  res.json({ errors });
});

// PROTECTED API ROUTES (AFTER SESSION ROUTES)
app.use('/api/admin', adminDash);  // Admin routes are protected inside the router
app.use('/api/owner', ownerApi);   // Owner routes are protected inside the router
app.use('/api/user', loggedUser);  // User routes are protected inside the router

// ======== PUBLIC ROUTES ========
app.get('/', (req, res) => {
  res.redirect('/public/home.html');
});

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'Kirby Chope Backend'
    });
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

app.get('/admin', authenticateToken, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/admindashboard.html'));
});

app.get('/resOwner', authenticateToken, requireOwner, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/resOwnerdashboard.html'));
});

app.get('/profile', authenticateToken, requireUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/userprofile.html'));
});

app.get('/reserveform', authenticateToken, requireUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/reserve.html'));
});

app.use((req, res, next) => {
    const isApi = req.originalUrl.startsWith('/api/');
    const acceptsJson = req.get('Accept')?.includes('application/json');
    
    // Log the 404 for monitoring
    logger.logEvent('http_404', `404 Not Found: ${req.originalUrl}`, {
        ip: req.ip,
        user_agent: req.get('User-Agent'),
        referer: req.get('Referer'),
        is_api: isApi
    }, req);
    
    if (isApi || acceptsJson) {
        // API or AJAX request - return JSON
        return res.status(404).json({ 
            error: 'Not Found', 
            message: 'API endpoint not found',
            path: req.originalUrl,
            timestamp: new Date().toISOString()
        });
    }
    
    // Web request - return custom HTML error page
    res.status(404);
    res.sendFile(path.join(__dirname, 'frontend/errors/404.html'));
});


app.use('/images', (req, res, next) => {
    // Security headers for images
    res.set({
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'"
    });
    next();
}, express.static(path.join(__dirname, 'uploads')));

// Image validation middleware
app.use('/static/img/restaurants/:filename', (req, res, next) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, '/static/img/restaurants', filename);
    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        console.log('❌ File not found, serving fallback');
        // Serve fallback image
        res.sendFile(path.join(__dirname, '/static/img/restaurants/no-image.png'));
    }
});

// Enhanced 404 handler
app.use((req, res, next) => {
    const isApi = req.originalUrl.startsWith('/api/');
    const acceptsJson = req.get('Accept')?.includes('application/json');
    
    console.log(`404 Not Found: ${req.originalUrl} from IP: ${req.ip}`);
    
    if (isApi || acceptsJson) {
        return res.status(404).json({ 
            error: 'Not Found', 
            message: 'API endpoint not found',
            path: req.originalUrl
        });
    }
    
    res.status(404);
    res.sendFile(path.join(__dirname, 'frontend/errors/404.html'));
});

// Enhanced general error handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;
    
    console.error(`Error ${statusCode}:`, err.message);
    
    const isApi = req.originalUrl.startsWith('/api/');
    const acceptsJson = req.get('Accept')?.includes('application/json');
    
    if (isApi || acceptsJson) {
        return res.status(statusCode).json({
            error: true,
            message: statusCode === 500 ? 'Internal Server Error' : err.message
        });
    }
    
    res.status(statusCode);
    
    let errorPagePath;
    switch (statusCode) {
        case 401:
            errorPagePath = path.join(__dirname, 'frontend/errors/401.html');
            break;
        case 403:
            errorPagePath = path.join(__dirname, 'frontend/errors/403.html');
            break;
        case 500:
            errorPagePath = path.join(__dirname, 'frontend/errors/500.html');
            break;
        default:
            errorPagePath = path.join(__dirname, 'frontend/errors/404.html');
    }
    
    res.sendFile(errorPagePath, (sendErr) => {
        if (sendErr) {
            res.send(`<h1>Error ${statusCode}</h1><a href="/">Go Home</a>`);
        }
    });
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
