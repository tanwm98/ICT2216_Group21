async function checkSession() {
    const response = await fetch('/api/session');
    const data = await response.json();

    if (!data.loggedIn && data.reason === 'no_access_token') {
        // Try to refresh token
        const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshResponse.ok) {
            return; // Token refreshed, continue
        }
    }

    if (!data.loggedIn) {
        window.location.href = '/login'; // Only logout if refresh also failed
    }
}

// Run check on load + every 30s
document.addEventListener('DOMContentLoaded', () => {
  checkSession();             // Run once immediately
  setTimeout(() => {
    setInterval(checkSession, 30000); // Then every 30s
  }, 1000);                   // First wait 1s for immediate kick
});