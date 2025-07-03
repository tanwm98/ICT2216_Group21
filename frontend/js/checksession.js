async function checkSession() {
  console.log('[SESSION] Checking session validity...');

  try {
    const res = await fetch('/api/session');
    const data = await res.json();

    console.log('[SESSION] Response data:', data);

    // ✅ User is NOT logged in and there's no token → allow access to public content
    if (!data.loggedIn) {
      const tokenExists = document.cookie.includes('token=');
      if (tokenExists) {
        console.warn('[SESSION] Token exists but session is invalid. Redirecting to login.');
        document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = '/login?expired=1';
      } else {
        console.info('[SESSION] No token found. Public access allowed.');
      }
      return;
    }

    console.log('[SESSION] Valid session. User:', data.userId, 'Role:', data.role);
  } catch (err) {
    console.error('[SESSION] Error while checking session:', err);
  }
}

// Run check on load + every 30s
document.addEventListener('DOMContentLoaded', () => {
  checkSession();             // Run once immediately
  setTimeout(() => {
    setInterval(checkSession, 30000); // Then every 30s
  }, 1000);                   // First wait 1s for immediate kick
});