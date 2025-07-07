const express = require('express');
const app = express();
app.disable('x-powered-by');
const port = 3000;
const path = require('path');
const db = require('./db');
require('dotenv').config();
const logger = require('./backend/logger');
const verifySession = require('./backend/middleware/verifySession');

// Publicly accessible routes
const openPaths = [
    '/login',
    '/register',
    '/request-reset',
    '/reset-password',
    '/static',       // static assets
    '/public',       // public frontend
    '/verify-token'  // for frontend session check
];

const redis = require('redis');
const {
    TOKEN_CONFIG,
    refreshAccessToken,
    validateAccessToken,
    checkUserInactivity,
    updateUserActivity,
    blacklistToken
    } = require('./frontend/js/token');
const { validateMfaPendingToken, MFA_TOKEN_CONFIG } = require('./backend/routes/authApi');


const isProd = process.env.NODE_ENV === 'production';

// Redis client configuration
const redisConfig = {
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  database: Number(process.env.REDIS_DB),

  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    family: 4,
    connectTimeout: 10000,
  },
  retryStrategy: (attempts) => {
    const baseDelay = 100;
    return Math.min(baseDelay * attempts, 2000);
  },

  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
};


// Create Redis client
const redisClient = redis.createClient(redisConfig);
redisClient.on('connect', () => {
    console.log('🔗 Redis client connected');
});

redisClient.on('ready', () => {
    console.log('✅ Redis client ready for commands');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
    logger.logSystem('error', 'Redis connection error', {
        error: err.message,
        stack: err.stack,
        redis_config: {
            host: redisConfig.host,
            port: redisConfig.port,
            db: redisConfig.db
        }
    });
});

redisClient.on('end', () => {
    console.log('🔌 Redis connection closed');
});

redisClient.on('reconnecting', (params) => {
    console.log(`🔄 Redis reconnecting... Attempt: ${params.attempt}, Delay: ${params.delay}ms`);
});

// Connect to Redis
async function connectRedis() {
    try {
        await redisClient.connect();
        console.log('🚀 Redis connection established successfully');
        
        // Test Redis connectivity
        await redisClient.ping();
        console.log('📡 Redis ping successful');
        
        return true;
    } catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
        logger.logSystem('error', 'Redis connection failed', {
            error: error.message,
            stack: error.stack
        });
        
        if (process.env.NODE_ENV === 'production') {
            console.error('🚨 CRITICAL: Redis unavailable in production');
        }
        return false;
    }
}

const redisHelpers = {
    // Safely execute Redis commands with error handling
    async safeExecute(command, ...args) {
        try {
            return await redisClient[command](...args);
        } catch (error) {
            console.error(`❌ Redis ${command} error:`, error);
            logger.logSystem('error', `Redis ${command} command failed`, {
                command,
                args: args.slice(0, 2),
                error: error.message
            });
            throw error;
        }
    },

    async getJSON(key) {
        try {
            const value = await this.safeExecute('get', key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            if (error.name === 'SyntaxError') {
                console.error(`❌ Invalid JSON in Redis key: ${key}`);
                return null;
            }
            throw error;
        }
    },

    async setJSON(key, value, ttlSeconds = null) {
        const jsonValue = JSON.stringify(value);
        if (ttlSeconds) {
            return await this.safeExecute('setEx', key, ttlSeconds, jsonValue);
        } else {
            return await this.safeExecute('set', key, jsonValue);
        }
    },

    isAvailable() {
        return redisClient && redisClient.isReady;
    }
};

global.redisClient = redisClient;
global.redisHelpers = redisHelpers;

if (process.env.NODE_ENV === 'production') {
    console.log = () => {};
    console.info = () => {};
}

// Cookie parser for JWT tokens
const cookieParser = require('cookie-parser');
app.use(cookieParser());


// Import middleware and authentication (UPDATED imports)
const { 
    authenticateToken,           // NEW: Validates access token, auto-refreshes if needed
    requireAdmin, 
    requireOwner, 
    requireUser, 
    requireUserOnly 
} = require('./frontend/js/token');

const { sanitizeInput, sanitizeOutput, createRateLimiter } = require('./backend/middleware/sanitization');

// Apply rate limiting (can now use Redis for distributed rate limiting)
app.use(createRateLimiter());

// Serve frontend static files
app.use('/js', express.static(path.join(__dirname, 'frontend/js')));
app.use('/common', express.static(path.join(__dirname, 'frontend/common')));
app.use('/static', express.static(path.join(__dirname, 'frontend/static')));
app.use('/public', express.static(path.join(__dirname, 'frontend/public')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sanitizeInput);
app.use(sanitizeOutput);

const disallowedMethods = ['TRACE', 'TRACK'];

app.use((req, res, next) => {
    if (disallowedMethods.includes(req.method)) {
        logger.logHttpError(405, `${req.method} method blocked for security reasons`, {}, req);
        return res.status(405).sendFile(path.join(__dirname, 'frontend/errors/405.html'));    }
    next();
});

// Import route files
const authRoutes = require('./backend/routes/authApi');
const { router: adminDash } = require('./backend/routes/adminDashboardApi');
const ownerApi = require('./backend/routes/ownerDashboardApi');
const homeRoutes = require('./backend/routes/homeApi');
const selectedResRoutes = require('./backend/routes/selectedResApi');
const search = require('./backend/routes/searchApi');
const loggedUser = require('./backend/routes/userProfileApi');
const csrf = require('csurf');

app.use((req, res, next) => {
    if (req.path === '/login' ||
        req.path === '/register' ||
        req.path === '/request-reset' ||
        req.path === '/reset-password' ||
        req.path === '/verify-mfa' ||
        req.path === '/signup-owner' ||
        req.path.startsWith('/api/session') ||
        req.path.startsWith('/api/auth') ||
        req.path.startsWith('/api/health')
    ) {
        return next();
    }

    csrf({
        cookie: {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        }
    })(req, res, next);
});

app.use((req, res, next) => {
    if (req.csrfToken) {
        res.locals.csrfToken = req.csrfToken();
        res.cookie('XSRF-TOKEN', req.csrfToken(), {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
    }
    next();
});

app.get('/api/csrf-token', (req, res) => {
    if (req.csrfToken) {
        res.json({
            csrfToken: req.csrfToken(),
            success: true
        });
    } else {
        res.json({
            csrfToken: null,
            success: false,
            message: 'CSRF protection not active for this route'
        });
    }
});


app.use(homeRoutes);
app.use(selectedResRoutes);
app.use('/', authRoutes);
app.use(search);

// Home route with token authentication
app.get('/', authenticateToken, (req, res) => {
    if (req.user.role === 'admin') {
        return res.redirect('/admin');
    } else if (req.user.role === 'owner') {
        return res.redirect('/resOwner');
    } else {
        return res.redirect('/public/home.html');
    }
});

// =============================================
// API Routes
// =============================================

app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;

        if (!refreshToken) {
            return res.status(401).json({
                error: 'No refresh token provided',
                code: 'REFRESH_TOKEN_MISSING'
            });
        }

        const { refreshAccessToken } = require('./frontend/js/token');
        const result = await refreshAccessToken(refreshToken, req);

        if (result.success) {
            res.cookie('access_token', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 5 * 60 * 1000, // 5 minutes
                path: '/'
            });

            res.json({
                success: true,
                expiresIn: 300
            });
        } else {
            res.status(401).json({
                error: result.error,
                code: result.code
            });
        }
    } catch (error) {
        console.error('❌ Token refresh error:', error);
        res.status(500).json({
            error: 'Internal server error during token refresh',
            code: 'REFRESH_ERROR'
        });
    }
});

app.get('/api/session', async (req, res) => {
    try {
        const accessToken = req.cookies.access_token;

        if (!accessToken) {
            return res.json({
                loggedIn: false,
                reason: 'no_access_token'
            });
        }

        const { validateAccessToken } = require('./frontend/js/token');
        const validation = await validateAccessToken(accessToken);

        if (validation.valid) {
            res.json({
                loggedIn: true,
                userId: validation.payload.userId,
                role: validation.payload.role,
                expiresAt: validation.payload.exp,
                permissions: {
                    canAccessAdmin: validation.payload.role === 'admin',
                    canAccessOwner: ['owner', 'admin'].includes(validation.payload.role),
                    canAccessUser: validation.payload.role === 'user'
                }
            });
        } else {
            res.json({
                loggedIn: false,
                reason: validation.reason
            });
        }
    } catch (error) {
        console.error('❌ Session validation error:', error);
        res.json({
            loggedIn: false,
            reason: 'validation_error'
        });
    }
});


// Health check with Redis status
app.get('/api/health', async (req, res) => {
    const redisStatus = redisHelpers.isAvailable() ? 'connected' : 'disconnected';
    
    let redisPing = false;
    try {
        if (redisHelpers.isAvailable()) {
            await redisClient.ping();
            redisPing = true;
        }
    } catch (error) {
        // Redis ping failed
    }

    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'Kirby Chope Backend',
        redis: {
            status: redisStatus,
            ping: redisPing
        }
    });
});

// PROTECTED API ROUTES
app.use('/api/admin', adminDash);
app.use('/api/owner', ownerApi);  
app.use('/api/user', loggedUser); 

// =============================================
// Public Routes
// =============================================
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

// Password reset routes
app.get('/reset-password', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.redirect('/request-reset?error=missing-token');
    }

    try {
        const user = await db('users')
            .where('reset_token', token)
            .where('reset_token_expires', '>', db.fn.now())
            .first();

        if (!user) {
            return res.redirect('/request-reset?error=invalid-token');
        }

        res.sendFile(path.join(__dirname, 'frontend/public/reset-password.html'));
    } catch (err) {
        console.error('Reset password validation error:', err);
        res.redirect('/request-reset?error=server-error');
    }
});

app.get('/mfa-verify', (req, res) => {
    const mfaPendingToken = req.cookies[MFA_TOKEN_CONFIG.cookieName];

    if (!mfaPendingToken) {
        return res.redirect('/login?error=session-expired');
    }

    // Optional: Validate token before serving page
    validateMfaPendingToken(mfaPendingToken).then(validation => {
        if (!validation.valid) {
            // Clear invalid token
            res.clearCookie(MFA_TOKEN_CONFIG.cookieName, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
            return res.redirect('/login?error=session-expired');
        }

        res.sendFile(path.join(__dirname, 'frontend/public/mfa-verify.html'));
    }).catch(error => {
        console.error('MFA token validation error:', error);
        return res.redirect('/login?error=session-expired');
    });
});

// =============================================
// Protected Routes
// =============================================
app.get('/admin', authenticateToken, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/admindashboard.html'));
});

app.get('/resOwner', authenticateToken, requireOwner, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/resOwnerdashboard.html'));
});

app.get('/profile', authenticateToken, requireUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/userprofile.html'));
});

app.get('/reserveform', authenticateToken, requireUserOnly, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/html/reserve.html'));
});

// =============================================
// Error Handlers
// =============================================
app.use((req, res, next) => {
    const isApi = req.originalUrl.startsWith('/api/');
    const acceptsJson = req.get('Accept')?.includes('application/json');
    
    logger.logEvent('http_404', `404 Not Found: ${req.originalUrl}`, {
        ip: req.ip,
        user_agent: req.get('User-Agent'),
        referer: req.get('Referer'),
        is_api: isApi
    }, req);
    
    if (isApi || acceptsJson) {
        return res.status(404).json({ 
            error: 'Not Found', 
            message: 'API endpoint not found',
            path: req.originalUrl,
            timestamp: new Date().toISOString()
        });
    }
    
    res.status(404);
    res.sendFile(path.join(__dirname, 'frontend/errors/404.html'));
});

// CSRF error handler
app.use((err, req, res, next) => {
    if (err.code !== 'EBADCSRFTOKEN') return next(err);

    logger.logEvent('security_csrf', 'CSRF token validation failed', {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
        user_agent: req.get('User-Agent'),
        referer: req.get('Referer'),
        has_csrf_header: !!req.headers['x-csrf-token'],
        has_xsrf_header: !!req.headers['x-xsrf-token'],
        csrf_cookie: !!req.cookies._csrf
    }, req);

    const isApi = req.originalUrl.startsWith('/api/');
    const acceptsJson = req.get('Accept')?.includes('application/json');

    if (isApi || acceptsJson) {
        return res.status(403).json({
            error: true,
            message: 'Invalid or missing CSRF token',
            code: 'CSRF_TOKEN_INVALID'
        });
    }
    res.status(403);
    res.sendFile(path.join(__dirname, 'frontend/errors/403.html'));
});

// General error handler
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
        case 400:
            errorPagePath = path.join(__dirname, 'frontend/errors/400.html');
            break;
        case 401:
            errorPagePath = path.join(__dirname, 'frontend/errors/401.html');
            break;
        case 403:
            errorPagePath = path.join(__dirname, 'frontend/errors/403.html');
            break;
        case 405:
            errorPagePath = path.join(__dirname, 'frontend/errors/405.html');
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

// =============================================
// Server Startup with Redis Connection
// =============================================
async function startServer() {
    try {
        // Connect to Redis first
        const redisConnected = await connectRedis();
        
        if (!redisConnected && process.env.NODE_ENV === 'production') {
            console.error('🚨 CRITICAL: Cannot start server without Redis in production');
            process.exit(1);
        } else if (!redisConnected) {
            console.warn('⚠️  Server starting without Redis (development mode)');
        }

        // Start HTTP server
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Redis: ${redisConnected ? 'Connected' : 'Disconnected'}`);
        });

        app.use((req, res, next) => {
            const isPublic = openPaths.some(path => req.path.startsWith(path));
            if (isPublic) return next();
            return verifySession(req, res, next);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    
    if (redisClient && redisClient.isReady) {
        await redisClient.quit();
        console.log('🔌 Redis connection closed');
    }
    
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    
    if (redisClient && redisClient.isReady) {
        await redisClient.quit();
        console.log('🔌 Redis connection closed');
    }
    
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;