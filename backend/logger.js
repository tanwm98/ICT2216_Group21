function logEvent(eventType, message, metadata = {}, req = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        event_type: eventType,
        message: message,
        service: 'kirby-chope',
        environment: process.env.NODE_ENV || 'production',
        ...metadata
    };
    
    // Add request context if available
    if (req) {
        logEntry.ip = req.ip || req.connection.remoteAddress;
        logEntry.user_agent = req.get('User-Agent');
        logEntry.session_id = req.sessionID;
        logEntry.request_method = req.method;
        logEntry.request_url = req.originalUrl;
        
        if (req.user) {
            logEntry.user_id = req.user.userId;
            logEntry.user_role = req.user.role;
            logEntry.user_name = req.user.name;
        }
    }
    
    console.log(JSON.stringify(logEntry));
}

/**
 * Log authentication events
 */
function logAuth(action, success, metadata = {}, req = null) {
    const eventType = success ? `auth_${action}_success` : `auth_${action}_failed`;
    const message = `Authentication ${action} ${success ? 'successful' : 'failed'}`;
    
    logEvent(eventType, message, {
        auth_action: action,
        success: success,
        ...metadata
    }, req);
}

/**
 * Log business events (bookings, registrations, etc.)
 */
function logBusiness(action, entity, metadata = {}, req = null) {
    const eventType = `business_${action}`;
    const message = `Business action: ${action} on ${entity}`;
    
    logEvent(eventType, message, {
        business_action: action,
        entity_type: entity,
        ...metadata
    }, req);
}

/**
 * Log system events (health, performance, errors)
 */
function logSystem(level, message, metadata = {}) {
    const eventType = `system_${level}`;
    
    logEvent(eventType, message, {
        log_level: level,
        ...metadata
    });
}

/**
 * Log security events
 */
function logSecurity(event, severity, metadata = {}, req = null) {
    const eventType = `security_${event}`;
    const message = `Security event: ${event}`;
    
    logEvent(eventType, message, {
        security_event: event,
        severity: severity,
        ...metadata
    }, req);
}

function logHttpError(statusCode, message, metadata = {}, req = null) {
    const eventType = `http_error_${statusCode}`;
    const errorMessage = `HTTP ${statusCode}: ${message}`;
    
    logEvent(eventType, errorMessage, {
        http_status: statusCode,
        error_type: 'http_error',
        severity: statusCode >= 500 ? 'high' : 'medium',
        ...metadata
    }, req);
}


module.exports = {
    logEvent,
    logAuth,
    logBusiness,
    logSystem,
    logSecurity
};
