const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const messageDiv = document.getElementById('resetMessage');

    if (!token) {
        messageDiv.textContent = 'Reset token is missing. Please use the link from your email.';
        messageDiv.className = 'text-danger';
        return;
    }

    if (newPassword !== confirmPassword) {
        messageDiv.textContent = 'Passwords do not match.';
        messageDiv.className = 'text-danger';
        return;
    }

    // Basic password validation
    if (newPassword.length < 8) {
        messageDiv.textContent = 'Password must be at least 8 characters long.';
        messageDiv.className = 'text-danger';
        return;
    }

    if (newPassword.length > 64) {
        messageDiv.textContent = 'Password must be less than 64 characters long.';
        messageDiv.className = 'text-danger';
        return;
    }

    try {
        console.log('🔄 Sending password reset request...');

        // Send request with CSRF token using helper
        const response = await csrfFetch('/reset-password', {
            method: 'PUT',
            body: JSON.stringify({
                token,
                newPassword
            })
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);

        // ✅ FIXED: Use 'response' instead of 'res'
        const data = await response.json();
        console.log('📄 Response data:', data);

        if (!response.ok) {
            throw new Error(data.message || 'Reset failed');
        }

        messageDiv.textContent = 'Password successfully reset! Redirecting to login...';
        messageDiv.className = 'text-success';

        setTimeout(() => {
            window.location.href = '/login';
        }, 2000); // 2-second delay before redirecting

    } catch (err) {
        console.error('❌ Password reset error:', err);
        messageDiv.textContent = err.message || 'An error occurred during password reset';
        messageDiv.className = 'text-danger';
    }
});