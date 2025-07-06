const protectedPaths = ['/admin', '/resOwner', '/profile', '/reserveform'];
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
const SESSION_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000; // Warn 2 minutes before logout

class SessionManager {
    constructor() {
        this.lastActivityTime = Date.now();
        this.warningShown = false;
        this.logoutTimer = null;
        this.warningTimer = null;
        this.isUserActive = true;

        this.initializeActivityTracking();
        this.startSessionChecking();
    }

    initializeActivityTracking() {
        // Track user interactions that indicate activity
        const activityEvents = [
            'mousedown', 'mousemove', 'keypress', 'scroll',
            'touchstart', 'click', 'keydown'
        ];

        const throttledActivity = this.throttle(() => {
            this.updateActivity();
        }, 1000); // Throttle to once per second

        activityEvents.forEach(event => {
            document.addEventListener(event, throttledActivity, { passive: true });
        });

        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateActivity();
                this.checkSession();
            }
        });
    }

    updateActivity() {
        const now = Date.now();
        this.lastActivityTime = now;
        this.isUserActive = true;

        // Clear any existing warning/logout timers
        this.clearTimers();
        this.warningShown = false;

        // Hide warning if shown
        this.hideInactivityWarning();

        // Set new timers
        this.setInactivityTimers();

        // Update server-side activity (throttled)
        this.updateServerActivity();
    }

    setInactivityTimers() {
        // Set warning timer
        this.warningTimer = setTimeout(() => {
            this.showInactivityWarning();
        }, INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT);

        // Set logout timer
        this.logoutTimer = setTimeout(() => {
            this.handleInactivityLogout();
        }, INACTIVITY_TIMEOUT);
    }

    clearTimers() {
        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
            this.warningTimer = null;
        }
        if (this.logoutTimer) {
            clearTimeout(this.logoutTimer);
            this.logoutTimer = null;
        }
    }

    isInactive() {
        const timeSinceActivity = Date.now() - this.lastActivityTime;
        return timeSinceActivity >= INACTIVITY_TIMEOUT;
    }

    async updateServerActivity() {
        // Throttled server activity update
        if (!this.lastServerUpdate || Date.now() - this.lastServerUpdate > 30000) {
            try {
                await fetch('/api/auth/activity', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        timestamp: Date.now()
                    })
                });
                this.lastServerUpdate = Date.now();
            } catch (error) {
                console.warn('Failed to update server activity:', error);
            }
        }
    }

    async checkSession() {
        const currentPath = window.location.pathname;
        if (!protectedPaths.includes(currentPath)) {
            return;
        }

        try {
            // Check if user has been inactive locally first
            if (this.isInactive()) {
                console.log('Local inactivity detected, logging out...');
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
                    await this.performLogout('server_inactivity');
                    return;
                }

                // Try refresh for other reasons (but only if user has been active)
                if (!this.isInactive() && this.shouldAttemptRefresh(data.reason)) {
                    const refreshSuccess = await this.attemptTokenRefresh();
                    if (!refreshSuccess) {
                        await this.performLogout('refresh_failed');
                    }
                } else {
                    await this.performLogout('authentication_failed');
                }
            } else {
                // Successfully logged in - reset failure counter
                this.resetFailureCounter();
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
        try {
            console.log('Attempting token refresh...');

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
                console.log('Token refresh successful');
                return true;
            } else {
                const errorData = await refreshResponse.json();
                console.log('Token refresh failed:', errorData);

                // Handle specific inactivity responses
                if (errorData.code === 'INACTIVITY_TIMEOUT') {
                    console.log('Refresh denied due to inactivity');
                    return false;
                }

                return false;
            }
        } catch (error) {
            console.error('Refresh request failed:', error);
            return false;
        }
    }

    showInactivityWarning() {
        if (this.warningShown || this.isInactive()) return;

        this.warningShown = true;

        // Create warning modal
        const modal = document.createElement('div');
        modal.id = 'inactivity-warning';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        const warningBox = document.createElement('div');
        warningBox.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;

        warningBox.innerHTML = `
            <h3 style="color: #fc6c3f; margin-bottom: 15px;">⚠️ Session Timeout Warning</h3>
            <p>You will be logged out in 2 minutes due to inactivity.</p>
            <p>Click "Stay Logged In" to continue your session.</p>
            <button id="stay-logged-in" style="background: #fc6c3f; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-right: 10px;">Stay Logged In</button>
            <button id="logout-now" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">Logout Now</button>
        `;

        modal.appendChild(warningBox);
        document.body.appendChild(modal);

        // Add event listeners
        document.getElementById('stay-logged-in').onclick = () => {
            this.updateActivity();
        };

        document.getElementById('logout-now').onclick = () => {
            this.performLogout('user_choice');
        };
    }

    hideInactivityWarning() {
        const modal = document.getElementById('inactivity-warning');
        if (modal) {
            modal.remove();
        }
        this.warningShown = false;
    }

    async handleInactivityLogout() {
        console.log('Automatic logout due to inactivity');
        await this.performLogout('inactivity_timeout');
    }

    async performLogout(reason) {
        console.log(`Performing logout, reason: ${reason}`);

        // Clear all timers
        this.clearTimers();
        this.hideInactivityWarning();

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
            this.checkSession();
        }, 1000);

        // Regular session checks
        setInterval(() => {
            this.checkSession();
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

// Global variables for backward compatibility
let globalSessionManager = null;

// Legacy checkSession function for backward compatibility
async function checkSession() {
    // Ensure session manager is initialized
    if (!globalSessionManager) {
        console.log('Creating session manager for legacy checkSession call');
        globalSessionManager = new SessionManager();
        // Store in window for future use
        window.sessionManager = globalSessionManager;
    }

    // Use the enhanced session manager's check method
    await globalSessionManager.checkSession();
}

// Initialize session manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Starting enhanced session monitoring...');

    // Create session manager
    globalSessionManager = new SessionManager();
    window.sessionManager = globalSessionManager;

    // Export legacy function globally for existing files
    window.checkSession = checkSession;
});

// Additional compatibility functions for direct access
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

// Ensure checkSession is available immediately (for edge cases)
window.checkSession = checkSession;