async function checkSession() {
    try {
        const response = await fetch('/api/session', {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            console.error('Session check failed:', response.status);
            window.location.href = '/login';
            return;
        }

        const data = await response.json();
        console.log('Session check result:', data); // Debug log

        // If not logged in, try to refresh first
        if (!data.loggedIn) {
            console.log('Not logged in, reason:', data.reason);

            // Try refresh for these specific reasons
            if (data.reason === 'no_access_token' ||
                data.reason === 'token_expired' ||
                data.reason === 'token_invalid') {

                console.log('Attempting token refresh...');

                try {
                    const refreshResponse = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        credentials: 'include'
                    });

                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json();
                        console.log('Token refresh successful:', refreshData);
                        return; // Success! Token refreshed, stay logged in
                    } else {
                        console.log('Token refresh failed:', refreshResponse.status);
                    }
                } catch (refreshError) {
                    console.error('Refresh request failed:', refreshError);
                }
            }

            // If we reach here, either refresh failed or shouldn't refresh
            console.log('Redirecting to login...');
            window.location.href = '/login';
        } else {
            // Successfully logged in
            console.log('Session valid, user:', data.userId, 'role:', data.role);
        }

    } catch (error) {
        console.error('Session check error:', error);
        // On network error, don't immediately logout - could be temporary
        // Only logout after multiple consecutive failures
        if (!window.sessionCheckFailures) window.sessionCheckFailures = 0;
        window.sessionCheckFailures++;

        if (window.sessionCheckFailures >= 3) {
            console.log('Multiple session check failures, redirecting to login');
            window.location.href = '/login';
        }
    }
}

// Reset failure counter on successful check
function resetFailureCounter() {
    window.sessionCheckFailures = 0;
}

// Run check on load + every 30s
document.addEventListener('DOMContentLoaded', () => {
    console.log('Starting session monitoring...');

    // Check immediately on page load
    checkSession().then(() => {
        resetFailureCounter();
    });

    // Then check every 30 seconds
    setInterval(async () => {
        await checkSession();
        resetFailureCounter();
    }, 60000);
});

// Optional: Check on page focus (when user returns to tab)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log('Page focused, checking session...');
        checkSession().then(() => {
            resetFailureCounter();
        });
    }
});