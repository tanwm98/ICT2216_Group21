document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    console.log('Login page loaded. error param:', urlParams.get('error'), 'success param:', urlParams.get('success'));

    if (urlParams.has('error')) {
        const captchaRequired = urlParams.get('captcha') === 'true';
        const captchaFailed = urlParams.get('captcha') === 'failed';

        if (captchaFailed){
            if (typeof grecaptcha !== 'undefined') {
                grecaptcha.reset();
                document.getElementById('captcha-message').style.display = 'block';
            }
        }
        if (captchaRequired) {
            document.getElementById('captcha-container').style.display = 'block';
            document.getElementById('captcha-message').style.display = 'block';
        }

        const errorModal = new bootstrap.Modal(document.getElementById('loginErrorModal'));
        errorModal.show();
    }

    if (urlParams.has('success')) {
        const successModal = new bootstrap.Modal(document.getElementById('registrationSuccessModal'));
        successModal.show();

        const cleanURL = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanURL);
    }
});


document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('loginForm');
    const captchaContainer = document.getElementById('captcha-container');

    if (form) {
        form.addEventListener('submit', function (e) {
            if (captchaContainer && captchaContainer.style.display !== 'none') {
                const captchaResponse = grecaptcha.getResponse();

                if (!captchaResponse) {
                    e.preventDefault(); // Stop form from submitting
                    alert('Please complete the CAPTCHA.');
                    return false;
                }
            }
        });
    }
});