document.addEventListener('DOMContentLoaded', async function () {
    try {
        const res = await fetch('/api/session/validation-errors');
        const data = await res.json();

        if (data.errors?.length) {
            const messages = data.errors.map(e => e.msg).join('\n');
            showModalError(messages);
        }
    }
    catch (err) {
            console.error('Failed to load session errors:', err);
    }
});
// Handle form submission with validation
document.getElementById('registerForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const firstname = document.getElementById('firstname').value.trim();
    const lastname = document.getElementById('lastname').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmpassword').value;

    const usernameRegex = /^[A-Za-z0-9._-]+$/;
    const nameRegex = /^[A-Za-z\s'-]+$/;
    const forbiddenNames = ['admin', 'root', 'support'];

    if (!usernameRegex.test(name)) {
        showModalError('Username can only contain letters, numbers, dots (.), dashes (-), or underscores (_).');
        return;
    } else if (name.length < 2 || name.length > 100) {
        showModalError('username must be between 2 and 100 characters.');
        return;
    } else if (forbiddenNames.includes(name.toLowerCase())) {
        showModalError('That username is reserved. Please choose another.');
        return;
    }

    // context aware names
    if (!nameRegex.test(firstname)) {
        showModalError('First name must not contain numbers or special characters.');
        return;
    } else if (firstname.length < 2 || firstname.length > 100) {
        showModalError('name must be between 2 and 100 characters.');
        return;
    } else if (forbiddenNames.includes(firstname.toLowerCase())) {
        showModalError('That name is reserved. Please choose another.');
        return;
    }

    if (!nameRegex.test(lastname)) {
        showModalError('Last name must not contain numbers or special characters.');
        return;
    } else if (lastname.length < 2 || lastname.length > 100) {
        showModalError('lastname must be between 2 and 100 characters.');
        return;
    }

    if (/[\u{1F600}-\u{1F6FF}<>]/u.test(firstname) ||
        /[\u{1F600}-\u{1F6FF}<>]/u.test(lastname) ||
        /[\u{1F600}-\u{1F6FF}<>]/u.test(name)) {
        showModalError('Name fields cannot contain emojis or angle brackets.');
        return;
    }

    if (password.length < 8 || password.length > 64) {
        showModalError('Password must be between 8 and 64 characters.');
        return;
    }

    if (password === name){
        showModalError('Password must not be used as username.');
        return;
    }

    if (password !== confirmPassword) {
        showModalError('Password and Confirm Password do not match.');
        return;
    }

    this.submit();
});

function showModalError(message) {
    document.getElementById('errorModalBody').innerText = message;
    const modal = new bootstrap.Modal(document.getElementById('errorModal'));
    modal.show();
}
document.addEventListener('DOMContentLoaded', async function () {
    // Check URL parameters for errors first
    const urlParams = new URLSearchParams(window.location.search);
    const errorFromUrl = urlParams.get('error');
    if (errorFromUrl) {
        let cleanError= decodeURIComponent(errorFromUrl);
        if (cleanError.includes(".Captcha")){
            cleanError = cleanError.replace(".Captcha", "").trim();
            document.getElementById("captcha-container").style.display = "block";
            document.getElementById('captcha-message').style.display = 'block';
        }
        showModalError(cleanError);
        return; // Don't check session errors if we have URL error
}

// Existing session error check
try {
    const res = await fetch('/api/session/validation-errors');
    const data = await res.json();
    if (data.errors?.length) {
        const messages = data.errors.map(e => e.msg).join('\n');
        showModalError(messages);
    }
} catch (err) {
    console.error('Failed to load session errors:', err);
}
});