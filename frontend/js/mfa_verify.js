document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    const codeInput = document.getElementById('mfa-code');
    const submitButton = form.querySelector('.verify-btn');

    // Inline error message ---
    const messageBox = document.createElement('div');
    messageBox.className = 'message error';
    messageBox.style.display = 'none';
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
                // Check user session to get role for proper redirect
                try {
                    const sessionRes = await fetch('/api/session', {
                        method: 'GET',
                        credentials: 'include'
                    });

                    if (sessionRes.ok) {
                        const sessionData = await sessionRes.json();

                        if (sessionData.loggedIn) {
                            // Role-based redirection
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
        messageBox.style.display = 'block';
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

    // Ensure every input is a numeric digit, submits form if length reaches 6.
    codeInput.addEventListener('input', function () {
        messageBox.style.display = 'none'; // Clear error after user input
        const code = codeInput.value.trim();

        if (/^\d{6}$/.test(code)) { // if any 6 digit entered, just auto submit.
            form.requestSubmit(); // trigger the form submit handler
        }
    });
});
