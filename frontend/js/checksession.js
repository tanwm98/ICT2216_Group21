const protectedPaths = ['/admin', '/resOwner', '/profile', '/reserveform'];
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const SESSION_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds

class SessionManager {
    constructor() {
        this.lastActivityTime = Date.now();
        this.logoutTimer = null;
        this.isUserActive = true;
        this.isLoggingOut = false;
        this.hasBeenInactive = false;

        // NEW: Refresh attempt tracking to prevent loops
        this.refreshAttempts = 0;
        this.maxRefreshAttempts = 2; // Max 2 attempts before giving up
        this.lastRefreshAttempt = 0;
        this.refreshCooldown = 60000; // 1 minute cooldown between failed attempts
        this.isRefreshing = false; // Prevent concurrent refresh attempts

        this.initializeActivityTracking();
        this.startSessionChecking();
    }

    initializeActivityTracking() {
        const activityEvents = [
            'mousedown', 'mousemove', 'keypress', 'scroll',
            'touchstart', 'click', 'keydown'
        ];

        const throttledActivity = this.throttle(() => {
            // Only update activity if we haven't started logout process
            if (!this.isLoggingOut && !this.hasBeenInactive) {
                this.updateActivity();
            }
        }, 1000);

        activityEvents.forEach(event => {
            document.addEventListener(event, throttledActivity, { passive: true });
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.isLoggingOut && !this.hasBeenInactive) {
                this.updateActivity();
                this.checkSession();
            }
        });
    }

    updateActivity() {
        // Don't update activity if we're logging out or have been inactive
        if (this.isLoggingOut || this.hasBeenInactive) {
            return;
        }

        const now = Date.now();
        this.lastActivityTime = now;
        this.isUserActive = true;

        // Clear existing timer and set new one
        this.clearTimer();
        this.setInactivityTimer();

        // NEW: Reset refresh attempts on user activity
        this.resetRefreshAttempts();

        // Update server activity
        this.updateServerActivity();
    }

    setInactivityTimer() {
        // Don't set timer if we're already logging out
        if (this.isLoggingOut) {
            return;
        }

        // Set single timer for immediate logout on inactivity
        this.logoutTimer = setTimeout(() => {
            if (!this.isLoggingOut) {
                this.handleInactivityLogout();
            }
        }, INACTIVITY_TIMEOUT);
    }

    clearTimer() {
        if (this.logoutTimer) {
            clearTimeout(this.logoutTimer);
            this.logoutTimer = null;
        }
    }

    isInactive() {
        const timeSinceActivity = Date.now() - this.lastActivityTime;
        return timeSinceActivity >= INACTIVITY_TIMEOUT;
    }

    // NEW: Reset refresh attempt counter
    resetRefreshAttempts() {
        this.refreshAttempts = 0;
        this.lastRefreshAttempt = 0;
    }

    // NEW: Check if we should attempt refresh
    canAttemptRefresh() {
        const now = Date.now();

        // Don't refresh if we're logging out or inactive
        if (this.isLoggingOut || this.hasBeenInactive || this.isInactive() || this.isRefreshing) {
            return false;
        }

        // Don't refresh if we've exceeded max attempts
        if (this.refreshAttempts >= this.maxRefreshAttempts) {
            console.log(`Max refresh attempts (${this.maxRefreshAttempts}) reached. Forcing logout.`);
            return false;
        }

        // Don't refresh if we're in cooldown period
        if (now - this.lastRefreshAttempt < this.refreshCooldown) {
            console.log('Refresh cooldown period active. Skipping refresh attempt.');
            return false;
        }

        return true;
    }

    async updateServerActivity() {
        // Check multiple conditions before updating server activity
        if (this.isLoggingOut || this.hasBeenInactive || this.isInactive()) {
            console.log('Skipping server activity update - user inactive or logging out');
            return;
        }

        // Throttle server updates to every 30 seconds
        if (!this.lastServerUpdate || Date.now() - this.lastServerUpdate > 30000) {
            try {
                const response = await fetch('/api/auth/activity', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        timestamp: Date.now()
                    })
                });

                if (response.ok) {
                    this.lastServerUpdate = Date.now();
                } else if (response.status === 401) {
                    // If we get 401, user session is invalid - trigger logout immediately
                    console.log('Server activity update failed - session invalid, logging out');
                    await this.performLogout('session_invalid');
                }
            } catch (error) {
                console.warn('Failed to update server activity:', error);
                // Don't logout on network errors, just log the issue
            }
        }
    }

    async checkSession() {
        const currentPath = window.location.pathname;
        if (!protectedPaths.includes(currentPath)) {
            return;
        }

        // Don't check session if we're already logging out or refreshing
        if (this.isLoggingOut || this.isRefreshing) {
            return;
        }

        try {
            // Check if user has been inactive locally first
            if (this.isInactive()) {
                console.log('Local inactivity detected, logging out...');
                this.hasBeenInactive = true;
                await this.performLogout('inactivity');
                return;
            }

            const response = await fetch('/api/session', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                console.error('Session check failed:', response.status);
                await this.performLogout('session_check_failed');
                return;
            }

            const data = await response.json();

            if (!data.loggedIn) {
                console.log('Not logged in, reason:', data.reason);

                // Handle specific inactivity responses from server
                if (data.reason === 'inactivity_timeout') {
                    console.log('Server detected inactivity, logging out...');
                    this.hasBeenInactive = true;
                    await this.performLogout('server_inactivity');
                    return;
                }

                // NEW: Enhanced refresh logic with attempt limiting
                if (this.shouldAttemptRefresh(data.reason) && this.canAttemptRefresh()) {
                    const refreshSuccess = await this.attemptTokenRefresh();
                    if (!refreshSuccess) {
                        // If refresh failed and we've hit max attempts, logout immediately
                        if (this.refreshAttempts >= this.maxRefreshAttempts) {
                            console.log('Max refresh attempts reached. Logging out.');
                            await this.performLogout('max_refresh_attempts_exceeded');
                        } else {
                            console.log(`Refresh failed. Attempt ${this.refreshAttempts}/${this.maxRefreshAttempts}`);
                            // Don't logout immediately - wait for next session check
                        }
                    }
                } else {
                    // Don't attempt refresh - logout immediately
                    console.log('Not attempting refresh. Logging out.');
                    await this.performLogout('authentication_failed');
                }
            } else {
                // Successfully logged in - reset failure counter and refresh attempts
                this.resetFailureCounter();
                this.resetRefreshAttempts();
            }

        } catch (error) {
            console.error('Session check error:', error);
            this.handleSessionCheckFailure();
        }
    }

    shouldAttemptRefresh(reason) {
        const refreshableReasons = [
            'no_access_token',
            'token_expired',
            'token_invalid'
        ];
        return refreshableReasons.includes(reason);
    }

    async attemptTokenRefresh() {
        // Double-check if we can attempt refresh
        if (!this.canAttemptRefresh()) {
            return false;
        }

        // Set refreshing flag to prevent concurrent attempts
        this.isRefreshing = true;
        this.refreshAttempts++;
        this.lastRefreshAttempt = Date.now();

        try {
            console.log(`Attempting token refresh... (Attempt ${this.refreshAttempts}/${this.maxRefreshAttempts})`);

            const refreshResponse = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    lastActivity: this.lastActivityTime
                })
            });

            if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();
                console.log('✅ Token refresh successful');

                // Reset refresh attempts on success
                this.resetRefreshAttempts();
                return true;
            } else {
                const errorData = await refreshResponse.json().catch(() => ({}));
                console.log('❌ Token refresh failed:', errorData);

                // Handle specific error cases that require immediate logout
                if (refreshResponse.status === 401) {
                    // ENHANCED: Handle Docker restart / Redis session loss scenarios
                    const fatalErrorCodes = [
                        'REFRESH_TOKEN_MISSING',    // No refresh token provided
                        'TOKEN_BLACKLISTED',        // Token is blacklisted
                        'SESSION_NOT_FOUND',        // Redis session missing (Docker restart)
                        'TOKEN_VERSION_MISMATCH',   // Token version doesn't match DB
                        'USER_NOT_FOUND',          // User doesn't exist
                        'TOKEN_INVALID',           // JWT signature invalid
                        'TOKEN_EXPIRED'            // Refresh token expired
                    ];

                    if (fatalErrorCodes.includes(errorData.code)) {
                        console.log(`🚨 Fatal refresh error: ${errorData.code}. Immediate logout required.`);

                        // Special handling for Docker restart scenario
                        if (errorData.code === 'SESSION_NOT_FOUND') {
                            console.log('🐳 Detected Docker restart - Redis sessions wiped. Clearing stale cookies.');
                            // Clear all cookies immediately
                            this.clearAllCookies();
                        }

                        // Force immediate logout for these specific errors
                        this.refreshAttempts = this.maxRefreshAttempts;
                        return false;
                    }

                    if (errorData.code === 'INACTIVITY_TIMEOUT') {
                        console.log('Refresh denied due to inactivity');
                        this.hasBeenInactive = true;
                        return false;
                    }

                    if (errorData.code === 'RATE_LIMIT_EXCEEDED') {
                        console.log('Refresh rate limit exceeded. Will retry later.');
                        return false;
                    }
                }

                // For other errors, allow retry (up to max attempts)
                return false;
            }
        } catch (error) {
            console.error('Refresh request failed:', error);

            // Network errors - don't immediately logout, allow retry
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                console.log('Network error during refresh. Will retry later.');
            }

            return false;
        } finally {
            // Clear refreshing flag
            this.isRefreshing = false;
        }
    }

    async handleInactivityLogout() {
        console.log('Automatic logout due to inactivity - no warning, immediate logout');
        this.hasBeenInactive = true;
        await this.performLogout('inactivity_timeout');
    }

    async performLogout(reason) {
        // Prevent multiple logout attempts
        if (this.isLoggingOut) {
            return;
        }

        console.log(`🚪 Performing logout, reason: ${reason}`);
        this.isLoggingOut = true;
        this.hasBeenInactive = true;

        // Clear timer
        this.clearTimer();

        try {
            // Notify server of logout
            await fetch('/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.warn('Logout request failed:', error);
        }

        // Clear local session data
        this.clearLocalSession();

        // Redirect to login with reason
        const loginUrl = `/login?reason=${encodeURIComponent(reason)}`;
        window.location.href = loginUrl;
    }

    clearLocalSession() {
        // Clear any local storage data
        localStorage.removeItem('user_session');
        sessionStorage.clear();
    }

    handleSessionCheckFailure() {
        if (!window.sessionCheckFailures) window.sessionCheckFailures = 0;
        window.sessionCheckFailures++;

        if (window.sessionCheckFailures >= 3) {
            console.log('Multiple session check failures, performing logout');
            this.performLogout('network_error');
        }
    }

    resetFailureCounter() {
        window.sessionCheckFailures = 0;
    }

    startSessionChecking() {
        // Initial session check
        setTimeout(() => {
            if (!this.isLoggingOut) {
                this.checkSession();
            }
        }, 1000);

        // Regular session checks
        setInterval(() => {
            if (!this.isLoggingOut && !this.isRefreshing) {
                this.checkSession();
            }
        }, SESSION_CHECK_INTERVAL);
    }

    // Utility function for throttling
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
}

// =============================================
// BACKWARD COMPATIBILITY FUNCTIONS
// =============================================

let globalSessionManager = null;

async function checkSession() {
    if (!globalSessionManager) {
        console.log('Creating session manager for legacy checkSession call');
        globalSessionManager = new SessionManager();
        window.sessionManager = globalSessionManager;
    }

    await globalSessionManager.checkSession();
}

// Initialize session manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Starting enhanced session monitoring with refresh loop prevention...');

    globalSessionManager = new SessionManager();
    window.sessionManager = globalSessionManager;
    window.checkSession = checkSession;
});

window.updateActivity = function() {
    if (globalSessionManager || window.sessionManager) {
        (globalSessionManager || window.sessionManager).updateActivity();
    }
};

window.performLogout = function(reason = 'manual') {
    if (globalSessionManager || window.sessionManager) {
        return (globalSessionManager || window.sessionManager).performLogout(reason);
    }
};

window.checkSession = checkSession;