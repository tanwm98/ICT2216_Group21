const { validateAccessToken } = require('../../frontend/js/token');
const redis = global.redisClient;

const IDLE_TIMEOUT_SECONDS = 15; // 15 seconds for testing; change back to 15 * 60 after

async function verifySession(req, res, next) {
    const accessToken = req.cookies.access_token;
    if (!accessToken) return res.redirect('/login?error=session-expired');

    const result = await validateAccessToken(accessToken);
    if (!result.valid) return res.redirect('/login?error=invalid-token');

    const userId = result.payload.userId;
    const redisKey = `session:lastActivity:${userId}`;

    try {
        const lastActive = await redis.get(redisKey);
        const now = Date.now();

        if (lastActive && now - parseInt(lastActive) > IDLE_TIMEOUT_SECONDS * 1000) {
            // Expired due to inactivity
            await redis.del(redisKey); // Optional: clear
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');
            return res.redirect('/login?error=idle-timeout');
        }

        // Update last activity timestamp
        await redis.set(redisKey, now.toString(), { EX: IDLE_TIMEOUT_SECONDS });
    } catch (err) {
        console.error('Redis session activity error:', err);
        return res.status(500).send('Session verification failed.');
    }

    req.user = result.payload;
    next();
}

module.exports = verifySession;
