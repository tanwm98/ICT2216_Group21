async function checkSession() {
  console.log('[SESSION] Checking session validity...');

  try {
    const res = await fetch('/api/session');
    console.log('[SESSION] Response status:', res.status);

    const data = await res.json();
    console.log('[SESSION] Response data:', data);

    if (!data.loggedIn) {
      console.warn('[SESSION] Invalid session detected. Redirecting...');
      document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = '/login?expired=1';
      return;
    }

    console.log('[SESSION] Session is valid. User ID:', data.userId, 'Role:', data.role);
  } catch (err) {
    console.error('[SESSION] Error while checking session:', err);
    window.location.href = '/login?error=session_check';
  }
}


// Run check on load + every 30s
document.addEventListener('DOMContentLoaded', () => {
  checkSession();             // Run once immediately
  setTimeout(() => {
    setInterval(checkSession, 30000); // Then every 30s
  }, 1000);                   // First wait 1s for immediate kick
});