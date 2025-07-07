const MAX_REAUTH_AGE_MS = 15 * 60 * 1000; // 15 minutes

async function requireRecentReauth(req, res, next) {
    const userId = req.user?.userId;
    
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        let lastVerified = null;
        
        if (global.redisHelpers && global.redisHelpers.isAvailable()) {
            const reauthKey = `admin_reauth:${userId}`;
            const reauthData = await global.redisHelpers.getJSON(reauthKey);
            
            if (reauthData && reauthData.timestamp) {
                lastVerified = reauthData.timestamp;
            }
        } else {
            // Fallback to in-memory storage
            if (global.adminReauthTimestamps && global.adminReauthTimestamps.has(userId)) {
                lastVerified = global.adminReauthTimestamps.get(userId);
            }
        }

        if (!lastVerified) {
            console.warn(`[REAUTH] Missing lastVerified for user ${userId}`);
            return res.status(401).json({ 
                error: 'Reauthentication required',
                code: 'REAUTH_NEEDED'
            });
        }

        const age = Date.now() - lastVerified;
        console.info(`[REAUTH] lastVerified age: ${age}ms (max: ${MAX_REAUTH_AGE_MS}ms)`);

        if (age > MAX_REAUTH_AGE_MS) {
            console.warn(`[REAUTH] Reauthentication expired for user ${userId}`);
            return res.status(401).json({ 
                error: 'Reauthentication expired - please re-enter your password',
                code: 'REAUTH_EXPIRED'
            });
        }
        next();

    } catch (error) {
        console.error('[REAUTH] Error checking reauthentication:', error);
        return res.status(500).json({ 
            error: 'Error verifying reauthentication',
            code: 'REAUTH_ERROR'
        });
    }
}

module.exports = { requireRecentReauth };