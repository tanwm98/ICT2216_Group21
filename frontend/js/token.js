const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { logAuth, logSecurity, logSystem } = require('../../backend/logger');

// Token configuration
const TOKEN_CONFIG = {
    access: {
        expiresIn: '5m',        // 5 minutes (longer than inactivity)
        maxAgeMs: 5 * 60 * 1000
    },
    refresh: {
        expiresIn: '1h',        // 1 hour
        maxAgeMs: 60 * 60 * 1000 // Fixed: should match expiresIn
    },
    inactivityTimeout: 15 * 60 * 1000  // 2 minutes
};

// Redis key patterns
const REDIS_KEYS = {
    session: (jti) => `session:${jti}`,
    blacklist: (jti) => `blacklist:${jti}`,
    userSessions: (userId) => `user_sessions:${userId}`,
    activity: (userId) => `activity:${userId}`,
    rateLimitRefresh: (userId) => `rate_limit:refresh:${userId}`
};

// =============================================
// Redis Helper Functions
// =============================================

async function isRedisAvailable() {
    return global.redisHelpers && global.redisHelpers.isAvailable();
}

async function storeRefreshSession(refreshJti, sessionData) {
    if (!await isRedisAvailable()) {
        throw new Error('Redis unavailable for session storage');
    }

    const sessionKey = REDIS_KEYS.session(refreshJti);
    const userSessionsKey = REDIS_KEYS.userSessions(sessionData.user_id);
    const activityKey = REDIS_KEYS.activity(sessionData.user_id);

    try {
        // Store session data with TTL
        await global.redisHelpers.setJSON(sessionKey, sessionData, TOKEN_CONFIG.refresh.maxAgeMs / 1000);

        // Add to user's active sessions
        await global.redisClient.sAdd(userSessionsKey, refreshJti);
        await global.redisClient.expire(userSessionsKey, 24 * 60 * 60); // 24 hours cleanup

        // Update activity timestamp
        await global.redisClient.setEx(activityKey, 30 * 60, Date.now().toString()); // 30 min TTL

        return true;
    } catch (error) {
        console.error('❌ Error storing refresh session:', error);
        throw error;
    }
}

async function getRefreshSession(refreshJti) {
    if (!await isRedisAvailable()) {
        return null;
    }

    try {
        const sessionKey = REDIS_KEYS.session(refreshJti);
        return await global.redisHelpers.getJSON(sessionKey);
    } catch (error) {
        console.error('❌ Error getting refresh session:', error);
        return null;
    }
}

async function removeRefreshSession(refreshJti, userId) {
    if (!await isRedisAvailable()) {
        return false;
    }

    try {
        const sessionKey = REDIS_KEYS.session(refreshJti);
        const userSessionsKey = REDIS_KEYS.userSessions(userId);

        // Remove session data
        await global.redisClient.del(sessionKey);

        // Remove from user's active sessions
        await global.redisClient.sRem(userSessionsKey, refreshJti);

        return true;
    } catch (error) {
        console.error('❌ Error removing refresh session:', error);
        return false;
    }
}

async function blacklistToken(jti, tokenType, reason, expiresAt, userId = null) {
    if (!await isRedisAvailable()) {
        console.warn('⚠️  Redis unavailable - cannot blacklist token');
        return false;
    }

    try {
        const blacklistKey = REDIS_KEYS.blacklist(jti);
        const blacklistData = {
            user_id: userId,
            token_type: tokenType,
            blacklisted_at: new Date().toISOString(),
            reason,
            expires_at: expiresAt
        };

        const ttlSeconds = Math.max(1, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
        await global.redisHelpers.setJSON(blacklistKey, blacklistData, ttlSeconds);

        logSecurity('token_blacklisted', 'medium', {
            jti,
            user_id: userId,
            token_type: tokenType,
            reason,
            expires_at: expiresAt
        });

        return true;
    } catch (error) {
        console.error('❌ Error blacklisting token:', error);
        return false;
    }
}

async function isTokenBlacklisted(jti) {
    if (!await isRedisAvailable()) {
        return false; // Fail open if Redis unavailable
    }

    try {
        const blacklistKey = REDIS_KEYS.blacklist(jti);
        const blacklistData = await global.redisHelpers.getJSON(blacklistKey);
        return !!blacklistData;
    } catch (error) {
        console.error('❌ Error checking blacklist:', error);
        return false; // Fail open
    }
}

async function updateUserActivity(userId) {
    if (!await isRedisAvailable()) {
        return false;
    }

    try {
        const activityKey = REDIS_KEYS.activity(userId);
        await global.redisClient.setEx(activityKey, 30 * 60, Date.now().toString());
        return true;
    } catch (error) {
        console.error('❌ Error updating user activity:', error);
        return false;
    }
}

async function checkUserInactivity(userId) {
    if (!await isRedisAvailable()) {
        return false; // Assume active if Redis unavailable
    }

    try {
        const activityKey = REDIS_KEYS.activity(userId);
        const lastActivityStr = await global.redisClient.get(activityKey);

        if (!lastActivityStr) {
            return true; // No activity record = inactive
        }

        const lastActivity = parseInt(lastActivityStr);
        const timeSinceActivity = Date.now() - lastActivity;

        return timeSinceActivity > TOKEN_CONFIG.inactivityTimeout;
    } catch (error) {
        console.error('❌ Error checking user inactivity:', error);
        return false; // Fail safe - assume active
    }
}

// =============================================
// Token Generation Functions
// =============================================

function generateAccessToken(payload) {
    const accessJti = uuidv4();
    const accessPayload = {
        ...payload,
        jti: accessJti,
        type: 'access',
        iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(accessPayload, process.env.JWT_SECRET, {
        expiresIn: TOKEN_CONFIG.access.expiresIn,
    });

    return { accessToken, accessJti };
}

function generateRefreshToken(payload) {
    const refreshJti = uuidv4();
    const refreshPayload = {
        userId: payload.userId,
        role: payload.role,
        name: payload.name,
        refreshTokenVersion: payload.refreshTokenVersion,
        jti: refreshJti,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000)
    };

    const refreshToken = jwt.sign(refreshPayload, process.env.JWT_SECRET, {
        expiresIn: TOKEN_CONFIG.refresh.expiresIn,
    });

    return { refreshToken, refreshJti };
}

async function generateTokenPair(userId, role, name, refreshTokenVersion, req) {
    const payload = { userId, role, name, refreshTokenVersion };

    // Generate both tokens
    const { accessToken, accessJti } = generateAccessToken(payload);
    const { refreshToken, refreshJti } = generateRefreshToken(payload);

    // Store refresh session in Redis
    const sessionData = {
        user_id: userId,
        user_role: role,
        user_name: name,
        refresh_token_version: refreshTokenVersion,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        expires_at: new Date(Date.now() + TOKEN_CONFIG.refresh.maxAgeMs).toISOString()
    };

    await storeRefreshSession(refreshJti, sessionData);

    // Log token generation
    logAuth('tokens_generated', true, {
        user_id: userId,
        access_jti: accessJti,
        refresh_jti: refreshJti,
        ip: req.ip
    }, req);

    return {
        accessToken,
        refreshToken,
        accessJti,
        refreshJti,
        expiresIn: TOKEN_CONFIG.access.maxAgeMs / 1000
    };
}

// =============================================
// Token Validation Functions
// =============================================

async function validateAccessToken(accessToken) {
    try {
        const payload = jwt.verify(accessToken, process.env.JWT_SECRET);

        // Check if token is blacklisted
        if (await isTokenBlacklisted(payload.jti)) {
            return {
                valid: false,
                reason: 'token_blacklisted',
                payload: null
            };
        }

        // Verify token type
        if (payload.type !== 'access') {
            return {
                valid: false,
                reason: 'invalid_token_type',
                payload: null
            };
        }

        // Check user inactivity
        if (await checkUserInactivity(payload.userId)) {
            // Blacklist the token due to inactivity
            const expiresAt = new Date(payload.exp * 1000).toISOString();
            await blacklistToken(payload.jti, 'access', 'inactivity_timeout', expiresAt, payload.userId);

            return {
                valid: false,
                reason: 'inactivity_timeout',
                payload: null
            };
        }

        // Update user activity
        await updateUserActivity(payload.userId);

        return {
            valid: true,
            payload,
            reason: null
        };

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return {
                valid: false,
                reason: 'token_expired',
                payload: null
            };
        }

        return {
            valid: false,
            reason: 'token_invalid',
            payload: null
        };
    }
}

async function validateRefreshToken(refreshToken) {
    try {
        const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // Check if token is blacklisted
        if (await isTokenBlacklisted(payload.jti)) {
            return {
                valid: false,
                reason: 'token_blacklisted',
                payload: null
            };
        }

        // Verify token type
        if (payload.type !== 'refresh') {
            return {
                valid: false,
                reason: 'invalid_token_type',
                payload: null
            };
        }

        // Get session from Redis
        const session = await getRefreshSession(payload.jti);
        if (!session) {
            return {
                valid: false,
                reason: 'session_not_found',
                payload: null
            };
        }

        // Verify refresh token version in database
        const user = await db('users')
            .select('refresh_token_version', 'role', 'name')
            .where('user_id', payload.userId)
            .first();

        if (!user) {
            return {
                valid: false,
                reason: 'user_not_found',
                payload: null
            };
        }

        if (user.refresh_token_version !== payload.refreshTokenVersion) {
            // Remove invalid session
            await removeRefreshSession(payload.jti, payload.userId);
            return {
                valid: false,
                reason: 'token_version_mismatch',
                payload: null
            };
        }

        // Check user inactivity
        if (await checkUserInactivity(payload.userId)) {
            // Blacklist refresh token and remove session
            const expiresAt = new Date(payload.exp * 1000).toISOString();
            await blacklistToken(payload.jti, 'refresh', 'inactivity_timeout', expiresAt, payload.userId);
            await removeRefreshSession(payload.jti, payload.userId);

            return {
                valid: false,
                reason: 'inactivity_timeout',
                payload: null
            };
        }

        return {
            valid: true,
            payload,
            session,
            user,
            reason: null
        };

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return {
                valid: false,
                reason: 'token_expired',
                payload: null
            };
        }

        return {
            valid: false,
            reason: 'token_invalid',
            payload: null
        };
    }
}

// =============================================
// Token Refresh Function
// =============================================

async function refreshAccessToken(refreshToken, req) {
    try {
        // Rate limiting for refresh attempts
        if (await isRedisAvailable()) {
            const rateLimitKey = REDIS_KEYS.rateLimitRefresh('unknown');
            const attempts = await global.redisClient.incr(rateLimitKey);
            if (attempts === 1) {
                await global.redisClient.expire(rateLimitKey, 60); // 1 minute window
            }
            if (attempts > 10) { // Max 10 refresh attempts per minute per IP
                return {
                    success: false,
                    error: 'Rate limit exceeded for token refresh',
                    code: 'RATE_LIMIT_EXCEEDED'
                };
            }
        }

        // Validate refresh token
        const validation = await validateRefreshToken(refreshToken);

        if (!validation.valid) {
            logSecurity('refresh_token_validation_failed', 'medium', {
                reason: validation.reason,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            }, req);

            return {
                success: false,
                error: 'Invalid refresh token',
                code: validation.reason.toUpperCase()
            };
        }

        // Generate new access token
        const payload = {
            userId: validation.payload.userId,
            role: validation.user.role,
            name: validation.user.name,
            refreshTokenVersion: validation.payload.refreshTokenVersion
        };

        const { accessToken, accessJti } = generateAccessToken(payload);

        // Update session activity
        await updateUserActivity(validation.payload.userId);

        // Log successful refresh
        logAuth('access_token_refreshed', true, {
            user_id: validation.payload.userId,
            refresh_jti: validation.payload.jti,
            new_access_jti: accessJti,
            ip: req.ip
        }, req);

        return {
            success: true,
            accessToken,
            expiresIn: TOKEN_CONFIG.access.maxAgeMs / 1000
        };

    } catch (error) {
        console.error('❌ Token refresh error:', error);
        return {
            success: false,
            error: 'Internal error during token refresh',
            code: 'REFRESH_ERROR'
        };
    }
}

// =============================================
// Authentication Middleware
// =============================================

async function authenticateToken(req, res, next) {
    try {
        const accessToken = req.cookies.access_token;
        const refreshToken = req.cookies.refresh_token;

        if (!accessToken && !refreshToken) {
            const error = new Error('Authentication required - no tokens provided');
            error.statusCode = 401;
            return next(error);
        }

        // Try to validate access token first
        if (accessToken) {
            const validation = await validateAccessToken(accessToken);

            if (validation.valid) {
                req.user = validation.payload;
                return next();
            }

            // Access token invalid/expired - try to refresh if we have refresh token
            if (refreshToken && validation.reason === 'token_expired') {
                const refreshResult = await refreshAccessToken(refreshToken, req);

                if (refreshResult.success) {
                    // Set new access token cookie
                    res.cookie('access_token', refreshResult.accessToken, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: TOKEN_CONFIG.access.maxAgeMs
                    });

                    // Validate the new access token and proceed
                    const newValidation = await validateAccessToken(refreshResult.accessToken);
                    if (newValidation.valid) {
                        req.user = newValidation.payload;
                        return next();
                    }
                }
            }
        }

        // If we reach here, authentication failed
        logSecurity('authentication_failed', 'medium', {
            has_access_token: !!accessToken,
            has_refresh_token: !!refreshToken,
            ip: req.ip,
            path: req.path
        }, req);

        const error = new Error('Authentication failed - invalid tokens');
        error.statusCode = 401;
        return next(error);

    } catch (error) {
        console.error('❌ Authentication middleware error:', error);
        const authError = new Error('Authentication error');
        authError.statusCode = 500;
        return next(authError);
    }
}

// =============================================
// Role-based Authorization Middleware
// =============================================

function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            const error = new Error('Authentication required');
            error.statusCode = 401;
            return next(error);
        }

        const userRole = req.user.role;
        const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        if (!rolesArray.includes(userRole)) {
            logSecurity('unauthorized_access_attempt', 'high', {
                user_id: req.user.userId,
                user_role: userRole,
                attempted_resource: req.originalUrl,
                required_roles: rolesArray,
                ip: req.ip
            }, req);

            const error = new Error('Insufficient permissions - Access denied');
            error.statusCode = 403;
            return next(error);
        }
        next();
    };
}

// Specific role middleware
const requireAdmin = requireRole('admin');
const requireOwner = requireRole(['owner', 'admin']);
const requireUser = requireRole(['user', 'owner', 'admin']);
const requireUserOnly = requireRole('user');

// =============================================
// Session Management Functions
// =============================================

async function revokeAllUserSessions(userId, reason = 'admin_revocation') {
    try {
        // Increment refresh token version to invalidate all refresh tokens
        await db('users')
            .where('user_id', userId)
            .increment('refresh_token_version', 1);

        // Get all active sessions for the user
        if (await isRedisAvailable()) {
            const userSessionsKey = REDIS_KEYS.userSessions(userId);
            const activeSessions = await global.redisClient.sMembers(userSessionsKey);

            // Remove all sessions
            for (const sessionJti of activeSessions) {
                await removeRefreshSession(sessionJti, userId);
            }

            // Clear the user sessions set
            await global.redisClient.del(userSessionsKey);

            // Clear activity tracking
            await global.redisClient.del(REDIS_KEYS.activity(userId));
        }

        logSecurity('all_user_sessions_revoked', 'high', {
            user_id: userId,
            reason,
            sessions_count: activeSessions?.length || 0
        });

        return true;
    } catch (error) {
        console.error('❌ Error revoking user sessions:', error);
        return false;
    }
}

async function logoutUser(accessToken, refreshToken, req, res) {
    try {
        const promises = [];

        // Blacklist access token if present
        if (accessToken) {
            try {
                const accessPayload = jwt.decode(accessToken);
                if (accessPayload && accessPayload.jti) {
                    const expiresAt = new Date(accessPayload.exp * 1000).toISOString();
                    promises.push(blacklistToken(accessPayload.jti, 'access', 'user_logout', expiresAt, accessPayload.userId));
                }
            } catch (error) {
                console.error('❌ Error processing access token for logout:', error);
            }
        }

        // Handle refresh token
        if (refreshToken) {
            try {
                const refreshPayload = jwt.decode(refreshToken);
                if (refreshPayload && refreshPayload.jti) {
                    // Remove session from Redis
                    promises.push(removeRefreshSession(refreshPayload.jti, refreshPayload.userId));

                    // Blacklist refresh token
                    const expiresAt = new Date(refreshPayload.exp * 1000).toISOString();
                    promises.push(blacklistToken(refreshPayload.jti, 'refresh', 'user_logout', expiresAt, refreshPayload.userId));
                }
            } catch (error) {
                console.error('❌ Error processing refresh token for logout:', error);
            }
        }

        // Execute all cleanup operations
        await Promise.allSettled(promises);

        // Clear cookies
        res.clearCookie('access_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        res.redirect('/');

        return true;
    } catch (error) {
        console.error('❌ Logout error:', error);
        return false;
    }
}

// =============================================
// Export Functions
// =============================================

module.exports = {
    // Authentication
    authenticateToken,

    // Authorization
    requireRole,
    requireAdmin,
    requireOwner,
    requireUser,
    requireUserOnly,

    // Token management
    generateTokenPair,
    refreshAccessToken,
    validateAccessToken,
    validateRefreshToken,

    // Session management
    revokeAllUserSessions,
    logoutUser,

    // Utility functions
    blacklistToken,
    isTokenBlacklisted,
    updateUserActivity,
    checkUserInactivity,

    // Configuration
    TOKEN_CONFIG
};