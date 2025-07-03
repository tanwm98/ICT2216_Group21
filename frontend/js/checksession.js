async function checkSession() {
  console.log('[SESSION] Checking session validity...');

  try {
    const res = await fetch('/api/session');
    const data = await res.json();

    console.log('[SESSION] Response:', data);

    // Case A: user is logged in but token is invalid → redirect
    if (res.status === 403 || data.message === "Session invalidated. Please re-login.") {
      console.warn('[SESSION] Logged-in user’s token is invalid → redirecting to login');
      document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = '/login?expired=1';
      return;
    }

    // Case B: not logged in → allow access (anonymous user)
    if (!data.loggedIn) {
      console.info('[SESSION] No active login. Anonymous browsing allowed.');
      return;
    }

    console.info('[SESSION] Valid session for:', data.userId);
  } catch (err) {
    console.error('[SESSION] Session check error:', err);
    // Optional: fallback redirect only if needed
    // window.location.href = '/login?error=session_check';
  }
}

// Run check on load + every 30s
document.addEventListener('DOMContentLoaded', () => {
  checkSession();             // Run once immediately
  setTimeout(() => {
    setInterval(checkSession, 30000); // Then every 30s
  }, 1000);                   // First wait 1s for immediate kick
});