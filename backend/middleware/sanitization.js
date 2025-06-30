const validator = require('validator');

function sanitizeInput(req, res, next) {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }

    // Sanitize route parameters
    if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params);
    }

    next();
}

/**
 * Sanitize response data to prevent XSS in API responses
 * This middleware sanitizes all outgoing JSON responses
 */
function sanitizeOutput(req, res, next) {
    const originalJson = res.json;

    res.json = function(data) {
        // Sanitize the response data
        const sanitizedData = sanitizeObject(data);
        return originalJson.call(this, sanitizedData);
    };

    next();
}

/**
 * Recursively sanitize an object
 */
function sanitizeObject(obj, parentKey = '') {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value, key);
        }
        return sanitized;
    }

    if (typeof obj === 'string') {
        return sanitizeFieldByType(parentKey, obj);  // Use field-aware sanitization
    }

    return obj;
}

/**
 * Sanitize individual string values
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;

    // Escape HTML entities to prevent XSS
    let sanitized = validator.escape(str);

    // Additional protection: remove potentially dangerous characters
    // while preserving normal punctuation
    sanitized = sanitized.replace(/[<>]/g, '');

    return sanitized;
}

/**
 * Advanced output sanitization for specific data types
 */
function sanitizeSpecificFields(req, res, next) {
    const originalJson = res.json;

    res.json = function(data) {
        // Apply field-specific sanitization
        const sanitizedData = sanitizeObjectAdvanced(data);
        return originalJson.call(this, sanitizedData);
    };

    next();
}

/**
 * Advanced sanitization with field-specific rules
 */
function sanitizeObjectAdvanced(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObjectAdvanced(item));
    }

    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeFieldByType(key, value);
        }
        return sanitized;
    }

    return obj;
}

/**
 * Field-specific sanitization rules
 */
function sanitizeFieldByType(fieldName, value) {
    if (typeof value === 'string') {
        // URL fields - don't escape URLs
        if (fieldName.toLowerCase().includes('url') ||
            fieldName.toLowerCase().includes('image') ||
            value.startsWith('/static/')) {
            return value;
        }

        // Email fields - additional validation
        if (fieldName.toLowerCase().includes('email')) {
            return validator.normalizeEmail(value) || '';
        }

        // Name fields - allow only letters, spaces, hyphens, apostrophes
        if (fieldName.toLowerCase().includes('name') ||
            fieldName.toLowerCase().includes('firstname') ||
            fieldName.toLowerCase().includes('lastname')) {
            // FIXED: Allow Unicode characters including Chinese, & symbol, and common punctuation
            const namePattern = /^[\p{L}\p{N}\s'&.-]+$/u;
            if (namePattern.test(value)) {
                // Only escape HTML tags, not ampersands for display purposes
                return value.replace(/[<>]/g, '');
            }
            return ''; // Invalid name format
        }
        if (fieldName.toLowerCase().includes('storename')) {
            return value.replace(/[<>]/g, '');
        }
        // Description/review fields - allow more characters but escape HTML
        if (fieldName.toLowerCase().includes('description') ||
            fieldName.toLowerCase().includes('review') ||
            fieldName.toLowerCase().includes('request')) {
            return validator.escape(value);
        }

        // Default string sanitization
        return validator.escape(value);
    }

    if (typeof value === 'object') {
        return sanitizeObjectAdvanced(value);
    }

    return value;
}

/**
 * Rate limiting middleware for sensitive operations
 */
function createRateLimiter(maxAttempts = 10, timeWindow = 60000) { // 10 attempts per minute
    const attempts = new Map();

    return (req, res, next) => {
        const identifier = req.ip + (req.user?.userId || 'anonymous');
        const now = Date.now();

        // Clean old attempts
        for (const [key, timestamps] of attempts.entries()) {
            attempts.set(key, timestamps.filter(time => now - time < timeWindow));
            if (attempts.get(key).length === 0) {
                attempts.delete(key);
            }
        }

        // Check current attempts
        const userAttempts = attempts.get(identifier) || [];

        if (userAttempts.length >= maxAttempts) {
            return res.status(429).json({
                error: 'Too many attempts. Please try again later.',
                retryAfter: Math.ceil((userAttempts[0] + timeWindow - now) / 1000)
            });
        }

        // Record this attempt
        userAttempts.push(now);
        attempts.set(identifier, userAttempts);

        next();
    };
}

module.exports = {
    sanitizeInput,
    sanitizeOutput,
    sanitizeSpecificFields,
    createRateLimiter
};