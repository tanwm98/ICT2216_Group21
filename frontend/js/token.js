const jwt = require('jsonwebtoken');
const db = require('../../db');
const { logSecurity } = require('../../backend/logger'); // ADD THIS LINE

async function authenticateToken(req, res, next) {
  const token = req.cookies.token; // token stored in cookie

  if (!token) {
    const error = new Error('Unauthorized: No token provided');
    error.statusCode = 401;
    return next(error);
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log(payload);

    // KNEX: Convert pool.query to Knex query builder
    const user = await db('users')
      .select('user_id', 'token_version')
      .where('user_id', payload.userId)
      .first(); // .first() returns single object or undefined

    if (!user) {
      const error = new Error('User account no longer exists');
      error.statusCode = 403;
      return next(error);
    }

    const currentTokenVersion = user.token_version;
    if (payload.tokenVersion !== currentTokenVersion) {
      const error = new Error('Session invalidated. Please re-login.');
      error.statusCode = 403;
      return next(error);
    }

    req.user = payload; // attach payload (userId, role, name) to request
    next();
  } catch (err) {
    const error = new Error('Forbidden - Invalid or expired token');
    error.statusCode = 403;
    return next(error);
  }
}

// Role-based authorization middleware
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

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireOwner,
  requireUser,
  requireUserOnly
};