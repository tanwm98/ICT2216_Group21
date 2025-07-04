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

    try {
        const csrfToken = document.cookie
            .split('; ')
            .find(row => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1];

        const res = await fetch('/reset-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                token,
                newPassword
            })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message || 'Reset failed');

        messageDiv.textContent = 'Password successfully reset! Redirecting to login...';
        messageDiv.className = 'text-success';
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000); // 2-second delay before redirecting
    } catch (err) {
        messageDiv.textContent = err.message;
        messageDiv.className = 'text-danger';
    }
});