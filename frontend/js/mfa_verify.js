document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    const codeInput = document.getElementById('mfa-code');
    const submitButton = form.querySelector('.verify-btn');

    const messageBox = document.createElement('div');
    messageBox.className = 'message error hidden';
    form.appendChild(messageBox);

    async function submitCode(code) {
        submitButton.disabled = true;

        try {
            const res = await fetch('/verify-mfa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
                credentials: 'include'
            });

            if (res.ok) {
                try {
                    const sessionRes = await fetch('/api/session', {
                        method: 'GET',
                        credentials: 'include'
                    });

                    if (sessionRes.ok) {
                        const sessionData = await sessionRes.json();

                        if (sessionData.loggedIn) {
                            if (sessionData.role === 'admin') {
                                window.location.href = '/admin';
                            } else if (sessionData.role === 'owner') {
                                window.location.href = '/resOwner';
                            } else {
                                window.location.href = '/';
                            }
                        } else {
                            window.location.href = '/';
                        }
                    } else {
                        // Fallback to root if session check fails
                        window.location.href = '/';
                    }
                } catch (sessionErr) {
                    console.error('Session check failed:', sessionErr);
                    window.location.href = '/';
                }
            } else {
                const data = await res.json();
                showError(data.message || 'Invalid or expired code.');
            }
        } catch (err) {
            console.error(err);
            showError('Network error. Please try again.');
        } finally {
            submitButton.disabled = false;
        }
    }

    function showError(msg) {
        messageBox.textContent = msg;
        messageBox.classList.remove('hidden');
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const code = codeInput.value.trim();

        if (!/^\d{6}$/.test(code)) {
            showError('Please enter a valid 6-digit code.');
            return;
        }

        submitCode(code);
    });

    codeInput.addEventListener('input', function () {
        messageBox.classList.add('hidden');
        const code = codeInput.value.trim();

        if (/^\d{6}$/.test(code)) {
            form.requestSubmit();
        }
    });
});