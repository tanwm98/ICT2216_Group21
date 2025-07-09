document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const form = document.getElementById('loginForm');
  const errorModalEl = document.getElementById('loginErrorModal');
  const successModalEl = document.getElementById('registrationSuccessModal');
  const loginBtn = document.getElementById('loginBtn');
  const captchaContainer = document.getElementById('captcha-container');
  const captchaMessage = document.getElementById('captcha-message');

  // Handle different error scenarios from backend
  function handleUrlParams() {
    const errorModalBody = errorModalEl.querySelector('.modal-body');

    if (urlParams.has('error')) {
      let errorMessage = 'Invalid email or password. Please try again.';

      // Check for specific error types
      if (urlParams.get('captcha') === 'failed') {
        errorMessage = 'Security verification failed. Please try again.';
      } else if (urlParams.get('captcha') === 'true') {
        errorMessage = 'Too many failed attempts. Please complete the security check and try again.';
        // Show captcha for subsequent attempts
        showCaptcha();
      }

      errorModalBody.textContent = errorMessage;
      new bootstrap.Modal(errorModalEl).show();

      // Clean URL after showing error
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    if (urlParams.has('success')) {
      new bootstrap.Modal(successModalEl).show();
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  // Show captcha container
  function showCaptcha() {
    if (captchaContainer) {
      captchaContainer.classList.remove('hidden');
    }
  }

  // Hide captcha container
  function hideCaptcha() {
    if (captchaContainer) {
      captchaContainer.classList.add('hidden');
    }
  }

  // Validate reCAPTCHA v2 completion
  function validateCaptcha() {
    // If captcha is not visible, no validation needed
    if (!captchaContainer || captchaContainer.classList.contains('hidden')) {
      return true;
    }

    // Check if reCAPTCHA is completed
    const recaptchaResponse = grecaptcha.getResponse();

    if (!recaptchaResponse) {
      // Show captcha message
      if (captchaMessage) {
        captchaMessage.classList.remove('hidden');
      }
      return false;
    }

    // Hide captcha message if it was shown
    if (captchaMessage) {
      captchaMessage.classList.add('hidden');
    }

    return true;
  }

  // Handle form submission
  form.addEventListener('submit', (e) => {
    // Only validate captcha if it's visible - don't prevent default unless captcha fails
    if (!validateCaptcha()) {
      e.preventDefault();
      return;
    }

    // Captcha is valid or not required, allow form to submit
    // Just update button state for UX
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
  });

  // Handle URL parameters on page load
  handleUrlParams();

  // Reset button state if user navigates back
  window.addEventListener('pageshow', () => {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log In';
  });
});