// Enhanced include.js with smart token management for public and authenticated users
(function() {
    'use strict';
    const hostname = window.location.hostname;
    const isProduction = hostname !== 'localhost' && hostname !== '127.0.0.1';

    if (isProduction) {
        console.log = function() {};
        console.info = function() {};
        console.debug = function() {};
    }
})();


// ===========================================
// Original Dynamic Loading Functions
// ===========================================
async function loadPageElement(url, placeholderId) {
    try {
        const response = await fetch(url);
        if (response.ok) {
            const html = await response.text();
            const placeholder = document.getElementById(placeholderId);
            if (placeholder) {
                placeholder.innerHTML = html;
            }
        } else {
            console.warn(`Failed to load ${url}: ${response.status}`);
        }
    } catch (error) {
        console.error(`Failed to load ${url}:`, error);
    }
}

// ===========================================
// Enhanced Token Manager
// ===========================================
class TokenManager {
    constructor() {
        this.refreshPromise = null;
        this.refreshTimer = null;
        this.isRefreshing = false;
        this.isAuthenticated = false;
        this.sessionCheckAttempts = 0;
        this.maxSessionCheckAttempts = 3;

        // Don't auto-initialize - wait for explicit call
        this.initialized = false;
    }

    /**
     * Enable token management for authenticated users
     */
    enable(expiresAt) {
        this.isAuthenticated = true;
        this.initialized = true;
        this.scheduleRefresh(expiresAt);
        console.log('Token management enabled for authenticated user');
    }

    /**
     * Disable token management
     */
    disable() {
        this.isAuthenticated = false;
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        console.log('Token management disabled');
    }

    /**
     * Check if current page requires authentication
     */
    isProtectedPage() {
        const protectedPaths = [
            '/admin', '/profile', '/resOwner', '/reserveform'
        ];
        const currentPath = window.location.pathname;
        return protectedPaths.some(path => currentPath.startsWith(path));
    }

    /**
     * Check current session status from server
     */
    async checkSession() {
        // Limit session check attempts to prevent infinite loops
        if (this.sessionCheckAttempts >= this.maxSessionCheckAttempts) {
            throw new Error('Max session check attempts reached');
        }

        this.sessionCheckAttempts++;

        try {
            const response = await fetch('/api/session', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                // Reset attempt counter on successful response (even if not ok)
                this.sessionCheckAttempts = Math.max(0, this.sessionCheckAttempts - 1);
                return { loggedIn: false };
            }

            // Reset attempt counter on success
            this.sessionCheckAttempts = 0;
            return response.json();

        } catch (error) {
            console.error('Session check error:', error);
            return { loggedIn: false };
        }
    }

    /**
     * Schedule automatic token refresh before expiration
     */
    scheduleRefresh(expiresAt) {
        // Only schedule for authenticated users
        if (!this.isAuthenticated) {
            return;
        }

        // Clear existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Calculate when to refresh (30 seconds before expiry)
        const expirationTime = expiresAt * 1000;
        const refreshTime = expirationTime - Date.now() - (60 * 1000);

        // Only schedule if refresh time is reasonable (between 1 second and 30 minutes)
        if (refreshTime > 1000 && refreshTime < 30 * 60 * 1000) {
            this.refreshTimer = setTimeout(() => {
                this.silentRefresh();
            }, refreshTime);

            console.log(`Token refresh scheduled in ${Math.round(refreshTime / 1000)} seconds`);
        } else if (refreshTime <= 1000 && refreshTime > -60000) {
            // Token expires very soon, refresh immediately (but not if expired > 1 minute ago)
            console.log('Token expires soon, refreshing immediately');
            setTimeout(() => this.silentRefresh(), 100);
        } else {
            console.log('Token refresh not scheduled - invalid expiration time');
        }
    }

    /**
     * Perform silent token refresh
     */
    async silentRefresh() {
        // Only refresh for authenticated users
        if (!this.isAuthenticated) {
            console.log('Skipping refresh for unauthenticated user');
            return { success: false, error: 'Not authenticated' };
        }

        // Prevent multiple simultaneous refresh attempts
        if (this.isRefreshing) {
            return this.refreshPromise;
        }

        this.isRefreshing = true;
        this.refreshPromise = this.performRefresh();

        try {
            const result = await this.refreshPromise;

            // Schedule next refresh only if successful and still authenticated
            if (result.success && this.isAuthenticated) {
                try {
                    const newSessionData = await this.checkSession();
                    if (newSessionData.loggedIn) {
                        this.scheduleRefresh(newSessionData.expiresAt);
                    } else {
                        this.disable();
                    }
                } catch (error) {
                    console.error('Failed to check session after refresh:', error);
                }
            }

            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    }

    /**
     * Internal method to perform the actual refresh
     */
    async performRefresh() {
        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (response.ok && data.success) {
                console.log('Token refreshed successfully');

                // Dispatch custom event for components to react
                window.dispatchEvent(new CustomEvent('tokenRefreshed', {
                    detail: { success: true }
                }));

                return { success: true };
            } else {
                console.warn('Token refresh failed:', data.error);
                this.handleRefreshFailure(data.code);
                return { success: false, error: data.error };
            }
        } catch (error) {
            console.error('Token refresh error:', error);

            // Dispatch failure event
            window.dispatchEvent(new CustomEvent('tokenRefreshFailed', {
                detail: { error: error.message }
            }));

            return { success: false, error: error.message };
        }
    }

    /**
     * Handle refresh token failure
     */
    handleRefreshFailure(errorCode) {
        // Clear any scheduled refresh
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Mark as unauthenticated
        this.disable();

        // Only redirect for critical failures and protected pages
        if (['REFRESH_TOKEN_MISSING', 'TOKEN_INVALID', 'TOKEN_EXPIRED'].includes(errorCode)) {
            if (this.isProtectedPage()) {
                window.dispatchEvent(new CustomEvent('sessionExpired', {
                    detail: { reason: errorCode }
                }));
            }
        }
    }

    /**
     * Enhanced fetch wrapper with automatic retry on 401
     */
    async authenticatedFetch(url, options = {}) {
        // Ensure credentials are included
        const fetchOptions = {
            ...options,
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // Add CSRF token if available
        const csrfToken = this.getCSRFToken();
        if (csrfToken) {
            fetchOptions.headers['X-CSRF-Token'] = csrfToken;
        }

        try {
            let response = await fetch(url, fetchOptions);

            // If 401 and authenticated user, attempt silent refresh
            if (response.status === 401 && this.isAuthenticated && !this.isRefreshing) {
                console.log('Received 401, attempting token refresh...');

                const refreshResult = await this.silentRefresh();

                if (refreshResult.success) {
                    // Retry original request with new token
                    response = await fetch(url, fetchOptions);
                } else {
                    // Refresh failed, handle authentication failure
                    this.handleAuthenticationFailure();
                }
            }

            return response;
        } catch (error) {
            console.error('Authenticated fetch error:', error);
            throw error;
        }
    }

    /**
     * Get CSRF token from cookie or meta tag
     */
    getCSRFToken() {
        // Try to get from cookie first
        const cookies = document.cookie.split(';');
        const csrfCookie = cookies.find(cookie => cookie.trim().startsWith('XSRF-TOKEN='));

        if (csrfCookie) {
            return decodeURIComponent(csrfCookie.split('=')[1]);
        }

        // Fallback to meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        return metaTag ? metaTag.getAttribute('content') : null;
    }

    /**
     * Handle authentication failure
     */
    handleAuthenticationFailure() {
        // Clear timers
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        this.disable();

        // Only redirect if on a protected page
        if (this.isProtectedPage()) {
            window.location.href = '/login?reason=session_expired';
        }
    }

    /**
     * Manually trigger refresh (useful for testing)
     */
    async forceRefresh() {
        return this.silentRefresh();
    }

    /**
     * Clean up timers
     */
    destroy() {
        this.disable();
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.initialized = false;
    }
}

// ===========================================
// Initialize Token Manager
// ===========================================
const tokenManager = new TokenManager();
window.tokenManager = tokenManager;

// Enhanced fetch for authenticated requests
window.authenticatedFetch = (url, options) => tokenManager.authenticatedFetch(url, options);

// ===========================================
// Original Pattern - Main Initialization
// ===========================================
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Load common elements first (original pattern)
        await Promise.all([
            loadPageElement('/common/head.html', 'head-placeholder'),
            loadPageElement('/common/footer.html', 'footer-placeholder')
        ]);

        // 2. First, check session status (original approach)
        const sessionData = await tokenManager.checkSession();

        // 3. Load appropriate header based on authentication status
        if (sessionData.loggedIn) {
            // Load authenticated header and enable token management
            await loadPageElement('/common/loginheader.html', 'header-placeholder');
            tokenManager.enable(sessionData.expiresAt);
            console.log('Authenticated user detected');
        } else {
            // Load public header, no token management needed
            await loadPageElement('/common/header.html', 'header-placeholder');
            console.log('Public user - no token management needed');
        }

        // 4. Check if protected page requires authentication
        if (tokenManager.isProtectedPage() && !sessionData.loggedIn) {
            console.log('Protected page accessed without authentication, redirecting...');
            window.location.href = '/login';
            return;
        }

        // 5. Dispatch page ready event
        window.dispatchEvent(new CustomEvent('pageReady', {
            detail: {
                authenticated: sessionData.loggedIn,
                user: sessionData
            }
        }));

    } catch (error) {
        console.error('Page initialization error:', error);

        // Fallback: load public header if everything fails
        await loadPageElement('/common/header.html', 'header-placeholder');
    }
});

// ===========================================
// Event Listeners for Token Management
// ===========================================
window.addEventListener('tokenRefreshed', (event) => {
    console.log('Token refreshed successfully');
});

window.addEventListener('tokenRefreshFailed', (event) => {
    console.error('Token refresh failed:', event.detail.error);
});

window.addEventListener('sessionExpired', (event) => {
    console.warn('Session expired:', event.detail.reason);

    // Only show alert and redirect for protected pages
    if (tokenManager.isProtectedPage()) {
        alert('Your session has expired. Please log in again.');
        window.location.href = '/login?reason=session_expired';
    }
});

window.addEventListener('pageReady', (event) => {
    console.log('Page ready:', event.detail);
});

// ===========================================
// Utility Functions
// ===========================================

// Function to check if user is authenticated (for UI updates)
window.isUserAuthenticated = () => tokenManager.isAuthenticated;

// Function to get current session info
window.getCurrentSession = async () => {
    try {
        return await tokenManager.checkSession();
    } catch (error) {
        console.error('Failed to get session info:', error);
        return { loggedIn: false };
    }
};

// Logout function
window.logout = async () => {
    try {
        tokenManager.destroy();

        const response = await fetch('/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/';
    }
};