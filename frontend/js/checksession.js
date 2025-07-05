// In checksession.js - only run on pages that REQUIRE authentication
document.addEventListener('DOMContentLoaded', () => {
    // Only run session checks on protected pages
    const protectedPaths = ['/admin', '/resOwner', '/profile', '/reserveform'];
    const currentPath = window.location.pathname;
    
    if (protectedPaths.includes(currentPath)) {
        console.log('Starting session monitoring for protected page...');
        checkSession().then(() => {
            resetFailureCounter();
        });

        setInterval(async () => {
            await checkSession();
            resetFailureCounter();
        }, 30000);
    } else {
        // On public pages, just check session for UI purposes (don't redirect)
        checkSession();
    }
});

async function checkSession() {
    try {
        const response = await fetch('/api/session', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.loggedIn) {
                // Update UI to show logged-in state (e.g., show profile link, hide login button)
                updateUIForLoggedInUser(data);
            } else {
                // Update UI to show logged-out state
                updateUIForLoggedOutUser();
            }
        }
    } catch (error) {
        console.log('Session check failed, assuming logged out');
        updateUIForLoggedOutUser();
    }
}

function updateUIForLoggedInUser(sessionData) {
    // Show user-specific UI elements
    console.log('User is logged in:', sessionData.role);
    // Add logic to show/hide UI elements based on login state
}

function updateUIForLoggedOutUser() {
    // Show guest UI elements
    console.log('User is not logged in');
    // Add logic to show/hide UI elements for guests
}