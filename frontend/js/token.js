const jwt = require('jsonwebtoken');
const pool = require('../../db');
const { logSecurity } = require('../../backend/logger'); // ADD THIS LINE

function authenticateToken(req, res, next) {
  const token = req.cookies.token; // token stored in cookie

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // attach payload (userId, role, name) to request
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Forbidden - Invalid or expired token' });
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