// Handle form submission with validation
document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const firstname = document.getElementById('firstname').value.trim();
    const lastname = document.getElementById('lastname').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmpassword').value;

    const usernameRegex = /^[A-Za-z0-9._-]+$/;
    const nameRegex = /^[A-Za-z\s'-]+$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const forbiddenNames = ['admin', 'root', 'support'];

    // Check if captcha is required and validate it
    const captchaContainer = document.getElementById('captcha-container');
    const isCaptchaVisible = !captchaContainer.classList.contains('hidden');

    if (isCaptchaVisible) {
        const recaptchaResponse = document.querySelector('.g-recaptcha-response');
        if (!recaptchaResponse || !recaptchaResponse.value) {
            showModalError('Please complete the CAPTCHA verification before submitting.');
            return;
        }
    }

    // Username validation
    if (!name || name.length === 0) {
        showModalError('Username is required.');
        return;
    }
    if (!usernameRegex.test(name)) {
        showModalError('Username can only contain letters, numbers, dots (.), dashes (-), or underscores (_).');
        return;
    }
    if (name.length < 2 || name.length > 100) {
        showModalError('Username must be between 2 and 100 characters.');
        return;
    }
    if (forbiddenNames.includes(name.toLowerCase())) {
        showModalError('That username is reserved. Please choose another.');
        return;
    }

    // First name validation
    if (!firstname || firstname.length === 0) {
        showModalError('First name is required.');
        return;
    }
    if (!nameRegex.test(firstname)) {
        showModalError('First name must not contain numbers or special characters.');
        return;
    }
    if (firstname.length < 2 || firstname.length > 100) {
        showModalError('First name must be between 2 and 100 characters.');
        return;
    }

    // Last name validation
    if (!lastname || lastname.length === 0) {
        showModalError('Last name is required.');
        return;
    }
    if (!nameRegex.test(lastname)) {
        showModalError('Last name must not contain numbers or special characters.');
        return;
    }
    if (lastname.length < 2 || lastname.length > 100) {
        showModalError('Last name must be between 2 and 100 characters.');
        return;
    }

    // Email validation
    if (!email || email.length === 0) {
        showModalError('Email is required.');
        return;
    }
    if (!emailRegex.test(email)) {
        showModalError('Please enter a valid email address.');
        return;
    }

    // Check for emojis and angle brackets - FIX: More comprehensive emoji detection
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}<>]/u;
    if (emojiRegex.test(firstname) || emojiRegex.test(lastname) || emojiRegex.test(name)) {
        showModalError('Name fields cannot contain emojis or angle brackets.');
        return;
    }

    // Password validation
    if (!password || password.length === 0) {
        showModalError('Password is required.');
        return;
    }
    if (password.length < 8 || password.length > 64) {
        showModalError('Password must be between 8 and 64 characters.');
        return;
    }

    if (password === name) {
        showModalError('Password must not be the same as username.');
        return;
    }

    if (password !== confirmPassword) {
        showModalError('Password and Confirm Password do not match.');
        return;
    }

    // All validation passed - prepare form data
    console.log('Form validation passed, submitting...');

    // Update form fields with validated values and submit using fetch
    const formData = new URLSearchParams();
    formData.append('name', name);
    formData.append('firstname', firstname);
    formData.append('lastname', lastname);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('confirmpassword', confirmPassword);
    formData.append('role', 'user');

    // Add reCAPTCHA response if captcha is visible
    if (isCaptchaVisible) {
        const recaptchaResponse = document.querySelector('.g-recaptcha-response');
        if (recaptchaResponse && recaptchaResponse.value) {
            formData.append('g-recaptcha-response', recaptchaResponse.value);
        }
    }

    // Submit using fetch with proper content-type for form data
    fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
    }).then(response => {
        if (response.redirected) {
            window.location.href = response.url;
        } else if (response.ok) {
            // Handle success case that doesn't redirect
            window.location.href = '/login?success=1';
        } else {
            // Handle error response
            return response.text().then(text => {
                console.error('Server error response:', text);
                showModalError('Registration failed. Please try again.');
            });
        }
    }).catch(error => {
        console.error('Form submission error:', error);
        showModalError('Network error. Please check your connection and try again.');
    });
});

function showModalError(message) {
    document.getElementById('errorModalBody').innerText = message;
    const modal = new bootstrap.Modal(document.getElementById('errorModal'));
    modal.show();
}

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const errorFromUrl = urlParams.get('error');
    const captchaParam = urlParams.get('captcha');

    // Show captcha if required (after 3 failed attempts)
    if (captchaParam === 'true' || captchaParam === 'failed') {
        const captchaContainer = document.getElementById('captcha-container');
        const captchaMessage = document.getElementById('captcha-message');

        captchaContainer.classList.remove('hidden');
        captchaMessage.classList.remove('hidden');
        captchaMessage.classList.add('show');

        // Update message for registration failures
        if (captchaParam === 'true') {
            captchaMessage.innerText = 'Multiple failed attempts detected. Please complete the CAPTCHA to continue.';
        }
    }

    // Handle error messages from validation or server
    if (errorFromUrl) {
        let errorMessage = 'An error occurred during registration.';

        // Handle specific error cases
        if (captchaParam === 'failed') {
            errorMessage = 'Please complete the CAPTCHA verification.';
        } else {
            // Decode the error message from URL
            errorMessage = decodeURIComponent(errorFromUrl);
        }

        showModalError(errorMessage);

        // Clear the URL parameters after showing the error
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});