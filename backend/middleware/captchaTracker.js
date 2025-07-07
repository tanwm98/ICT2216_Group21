// middleware/captchaTracker.js

const ATTEMPT_LIMIT = 3;
const WINDOW_MINUTES = 15;

const attemptTracker = {}; // { ip_or_email: [timestamps] }

function pruneOldAttempts(attempts) {
    const now = Date.now();
    return attempts.filter(ts => now - ts < WINDOW_MINUTES * 60 * 1000);
}

function recordFailure(identifier) {
    const now = Date.now();
    if (!attemptTracker[identifier]) {
        attemptTracker[identifier] = [];
    }
    attemptTracker[identifier].push(now);
    attemptTracker[identifier] = pruneOldAttempts(attemptTracker[identifier]);
}

function resetFailures(identifier) {
    delete attemptTracker[identifier];
}

function shouldShowCaptcha(identifier) {
    const attempts = attemptTracker[identifier] || [];
    return pruneOldAttempts(attempts).length >= ATTEMPT_LIMIT;
}

module.exports = {
    recordFailure,
    resetFailures,
    shouldShowCaptcha
};
