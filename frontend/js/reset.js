document.getElementById('requestResetForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const messageDiv = document.getElementById('requestMessage');

    try {
        const csrfToken = document.cookie
            .split('; ')
            .find(row => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1];

        const res = await fetch('/request-reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                email
            })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message || 'Something went wrong');

        messageDiv.textContent = 'If the email exists, a reset link has been sent.';
        messageDiv.className = 'text-success';
        document.getElementById('requestResetForm').reset();
    } catch (err) {
        messageDiv.textContent = err.message;
        messageDiv.className = 'text-danger';
    }
});
