const MAX_REAUTH_AGE_MS = 1 * 60 * 1000; // 5 minutes

function requireRecentReauth(req, res, next) {
    const MAX_AGE_MS = 1 * 60 * 1000;
    const lastVerified = req.session?.lastVerified;

    if (!lastVerified) {
        console.warn(`[REAUTH] Missing lastVerified for user ${req.user?.userId}`);
    } else {
        const age = Date.now() - lastVerified;
        console.info(`[REAUTH] lastVerified age: ${age}ms`);
    }

    if (!lastVerified || Date.now() - lastVerified > MAX_AGE_MS) {
        return res.status(401).json({ error: 'Reauthentication required' });
    }

    next();
}

module.exports = { requireRecentReauth };
