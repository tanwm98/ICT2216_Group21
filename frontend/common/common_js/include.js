// Enhanced include.js that checks session on navigation
(function() {
    'use strict';
    const hostname = window.location.hostname;
    const isProduction = hostname !== 'localhost' && hostname !== '127.0.0.1';

    if (isProduction) {
        console.log = function() {};
        console.info = function() {};
        console.debug = function() {};
        console.warn = function() {};
        console.error = function() {};
    }
})();

// =============================================
// Page Classification
// =============================================

const PUBLIC_PAGES = [
    '/', '/search', '/login', '/register', '/request-reset',
    '/reset-password', '/selectedRes', '/rOwnerReg', '/mfa-verify'
];

const PROTECTED_PAGES = [
    '/admin', '/resOwner', '/profile', '/reserveform'
];

function isPublicPage() {
    const path = window.location.pathname;
    return PUBLIC_PAGES.includes(path) ||
           path.startsWith('/public/') ||
           path.startsWith('/static/') ||
           path.startsWith('/js/') ||
           path.startsWith('/common/');
}

function isProtectedPage() {
    const path = window.location.pathname;
    return PROTECTED_PAGES.includes(path) ||
           path.startsWith('/api/admin') ||
           path.startsWith('/api/owner') ||
           path.startsWith('/api/user');
}

// =============================================
// Enhanced Session Management
// =============================================

let sessionCheckInterval = null;
let lastNavigationCheck = 0;

async function checkSession(forceAuth = false, source = 'unknown') {
    console.log(`🔍 [${source}] Checking session at:`, new Date().toLocaleTimeString(), 'Force auth:', forceAuth);

    try {
        const response = await fetch('/api/session', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            console.error('❌ Session check failed:', response.status, response.statusText);
            return { loggedIn: false, reason: 'api_error' };
        }

        const data = await response.json();
        console.log(`📊 [${source}] Session data:`, data);

        if (!data.loggedIn && data.reason === 'no_access_token') {
            console.log(`🔄 [${source}] Access token missing, attempting refresh...`);

            const refreshResponse = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });

            if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();

                // Re-check session after successful refresh
                const recheckResponse = await fetch('/api/session', {
                    method: 'GET',
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });

                if (recheckResponse.ok) {
                    const newData = await recheckResponse.json();
                    console.log(`✅ [${source}] Session refreshed successfully:`, newData);
                    return newData;
                }
            } else {
                console.error(`❌ [${source}] Token refresh failed:`, refreshResponse.status);
            }
        }

        if (!data.loggedIn) {
            if (forceAuth || isProtectedPage()) {
                console.log(`🚪 [${source}] Protected page requires login, redirecting. Reason:`, data.reason);

                if (sessionCheckInterval) {
                    clearInterval(sessionCheckInterval);
                    sessionCheckInterval = null;
                }

                setTimeout(() => {
                    window.location.href = '/login?reason=' + (data.reason || 'auth_required') + '&redirect=' + encodeURIComponent(window.location.pathname);
                }, 1000);
            }
        }
        return data;
    } catch (error) {
        console.error(`❌ [${source}] Session check error:`, error);
        return { loggedIn: false, reason: 'network_error' };
    }
}

function startSessionMonitoring() {
    console.log('⏰ Starting session monitoring (50-second intervals)');

    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }

    sessionCheckInterval = setInterval(() => {
        const shouldForceAuth = isProtectedPage();
        checkSession(shouldForceAuth, 'interval');
    }, 300000);
}

// =============================================
// 🌟 NEW: Navigation-Aware Session Checking
// =============================================

function checkSessionOnNavigation() {
    const now = Date.now();

    // Prevent too frequent checks (max once per 5 seconds)
    if (now - lastNavigationCheck < 5000) {
        console.log('🚫 Navigation check throttled (too recent)');
        return;
    }

    lastNavigationCheck = now;
    console.log('🧭 Navigation detected - checking session immediately');

    const shouldForceAuth = isProtectedPage();
    checkSession(shouldForceAuth, 'navigation');
}

// Listen for navigation events
function setupNavigationListeners() {
    // Listen for page visibility changes (user switching tabs/windows)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isProtectedPage()) {
            checkSessionOnNavigation();
        }
    });

    // Listen for focus events (user clicking back into the browser)
    window.addEventListener('focus', () => {
        if (isProtectedPage()) {
            console.log('🎯 Window focused - checking session');
            checkSessionOnNavigation();
        }
    });

    // Listen for beforeunload to clean up
    window.addEventListener('beforeunload', () => {
        if (sessionCheckInterval) {
            console.log('🧹 Cleaning up session monitoring interval');
            clearInterval(sessionCheckInterval);
        }
    });

    // 🌟 NEW: Check session when user interacts with protected elements
    document.addEventListener('click', (e) => {
        // Check if clicked element or its parent has a protected link
        const link = e.target.closest('a[href]');
        if (link) {
            const href = link.getAttribute('href');
            if (href && (href.startsWith('/admin') || href.startsWith('/profile') || href.startsWith('/resOwner') || href.startsWith('/reserveform'))) {
                console.log('🔗 Protected link clicked - checking session preemptively');
                checkSessionOnNavigation();
            }
        }
    });
}

// =============================================
// Enhanced Include Loading
// =============================================

window.addEventListener('DOMContentLoaded', () => {
    const shouldForceAuth = isProtectedPage();
    const initialSource = isProtectedPage() ? 'protected-page-load' : 'page-load';

    checkSession(shouldForceAuth, initialSource)
        .then(data => {
            const includes = {
                head: '/common/head.html',
                header: data.loggedIn ? '/common/loginheader.html' : '/common/header.html',
                footer: '/common/footer.html'
            };

            const loadIncludes = Object.entries(includes).map(([key, path]) => {
                const el = document.getElementById(`${key}-placeholder`);
                if (el) {
                    return fetch(path)
                        .then(res => res.text())
                        .then(html => {
                            el.innerHTML = html;

                            if (key === 'head') {
                                const scripts = el.querySelectorAll('script');
                                scripts.forEach(script => {
                                    if (script.src) {
                                        const newScript = document.createElement('script');
                                        newScript.src = script.src;
                                        newScript.onload = () => console.log('✅ Script loaded:', script.src);
                                        newScript.onerror = () => console.error('❌ Script failed to load:', script.src);
                                        document.head.appendChild(newScript);
                                    } else if (script.textContent) {
                                        try {
                                            eval(script.textContent);
                                        } catch (error) {
                                            console.error('❌ Script execution error:', error);
                                        }
                                    }
                                });
                            }
                        })
                        .catch(err => {
                            console.error(`Error loading ${key}:`, err);
                        });
                }
                return Promise.resolve();
            });

            Promise.all(loadIncludes).then(() => {
                console.log('✅ All includes loaded');

                setupNavigationListeners();

                // Start regular monitoring
                setTimeout(() => {
                    startSessionMonitoring();
                }, 2000);

                // Handle URL parameters
                const url = new URL(window.location.href);
                if (url.searchParams.get('reset') === '1') {
                    const modalEl = document.getElementById('resetPasswordModal');
                    if (modalEl) {
                        const resetModal = new bootstrap.Modal(modalEl);
                        resetModal.show();
                    }
                }

                const redirectParam = url.searchParams.get('redirect');
                if (redirectParam && data.loggedIn) {
                    console.log('🔄 Redirecting authenticated user to:', redirectParam);
                    setTimeout(() => {
                        window.location.href = redirectParam;
                    }, 1000);
                }
            });
        })
        .catch(err => {
            console.error('Error in session check:', err);
        });
});

// Make functions globally available
window.checkSession = checkSession;
window.startSessionMonitoring = startSessionMonitoring;
window.checkSessionOnNavigation = checkSessionOnNavigation;
window.isPublicPage = isPublicPage;
window.isProtectedPage = isProtectedPage;