function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showAlert(alertId, show = true) {
    const alert = document.getElementById(alertId);
    if (show) {
        alert.classList.remove('hidden');
        alert.classList.add('show');
    } else {
        alert.classList.add('hidden');
        alert.classList.remove('show');
    }
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = ` ${message}`;
    showAlert('errorAlert', true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError() {
    showAlert('errorAlert', false);
}

function showSuccess() {
    showAlert('successAlert', true);
}

function showCaptcha() {
    const captchaContainer = document.getElementById('captcha-container');
    const captchaMessage = document.getElementById('captcha-message');

    if (captchaContainer) {
        captchaContainer.classList.remove('hidden');
        captchaContainer.classList.add('show');
    }

    if (captchaMessage) {
        captchaMessage.classList.remove('hidden');
        captchaMessage.classList.add('show');
    }
}

function setElementValidation(element, isValid, customMessage = null) {
    if (isValid) {
        element.classList.remove('is-invalid');
        element.classList.add('is-valid');
        element.setCustomValidity('');
    } else {
        element.classList.add('is-invalid');
        element.classList.remove('is-valid');
        if (customMessage) {
            element.setCustomValidity(customMessage);
        }
    }
}

function validatePasswords() {
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const passwordError = document.getElementById('passwordError');

    if (password.value && confirmPassword.value) {
        if (password.value !== confirmPassword.value) {
            passwordError.classList.remove('hidden');
            setElementValidation(confirmPassword, false, 'Passwords do not match');
            return false;
        } else {
            passwordError.classList.add('hidden');
            setElementValidation(confirmPassword, true);
            return true;
        }
    }
    return true;
}

function validateCapacity() {
    const capacity = document.getElementById('capacity');
    const totalCapacity = document.getElementById('totalCapacity');

    const cap = parseInt(capacity.value);
    const totalCap = parseInt(totalCapacity.value);

    if (cap && totalCap && cap > totalCap) {
        setElementValidation(totalCapacity, false, 'Total capacity must be greater than or equal to seating capacity');
        return false;
    } else {
        setElementValidation(totalCapacity, true);
        return true;
    }
}

function validateFile() {
    const fileInput = document.getElementById('image');
    const file = fileInput.files[0];

    if (!file) {
        setElementValidation(fileInput, false);
        return false;
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        showError('File size must be less than 5MB.');
        setElementValidation(fileInput, false);
        return false;
    }

    // Strict file type validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
        showError('Please upload a valid image file (JPG, JPEG or PNG only).');
        setElementValidation(fileInput, false);
        return false;
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
        showError('Invalid file extension. Only .jpg, .jpeg, .png files are allowed.');
        setElementValidation(fileInput, false);
        return false;
    }

    setElementValidation(fileInput, true);
    return true;
}

function validateTimeRange() {
    const opening = document.getElementById('opening').value;
    const closing = document.getElementById('closing').value;

    if (opening && closing && opening >= closing) {
        showError('Closing time must be after opening time.');
        return false;
    }
    return true;
}

function setSubmitButtonLoading(isLoading = false) {
    const submitBtn = document.getElementById('submitBtn');

    if (isLoading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🚀 Submit Application';
    }
}

function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');
    const successAlert = document.getElementById('successAlert');

    // Handle error parameter with XSS protection
    if (urlParams.has('error')) {
        const errorText = urlParams.get('error');
        const captchaRequired = urlParams.get('captcha') === 'true';  // ✅ Add this line
        let cleanError = errorText || 'Please check your information and try again.';

        // ✅ Handle both .Captcha and captcha=true approaches
        if (cleanError.includes(".Captcha")) {
            cleanError = cleanError.replace(".Captcha", "").trim();
            showCaptcha();
        } else if (captchaRequired) {  // ✅ Add this condition
            showCaptcha();
        }

        errorMessage.textContent = ` ${cleanError}`;
        showAlert('errorAlert', true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Handle success parameter
    if (urlParams.has('success')) {
        showAlert('successAlert', true);

        // Redirect to login after 3 seconds
        setTimeout(() => {
            window.location.href = '/login';
        }, 3000);
    }

    // Clean URL
    if (urlParams.has('error') || urlParams.has('success')) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

function validateAllFields(form) {
    let isValid = true;

    // Validate all required fields
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
        if (!field.checkValidity()) {
            setElementValidation(field, false);
            isValid = false;
        } else {
            setElementValidation(field, true);
        }
    });

    // Custom validations
    if (!validatePasswords()) {
        isValid = false;
    }

    if (!validateCapacity()) {
        isValid = false;
    }

    if (!validateFile()) {
        isValid = false;
    }

    if (!validateTimeRange()) {
        isValid = false;
    }

    return isValid;
}

function focusFirstInvalidField(form) {
    const firstInvalid = form.querySelector('.is-invalid');
    if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function setupEventListeners() {
    const form = document.getElementById('ownerSignupForm');
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const capacity = document.getElementById('capacity');
    const totalCapacity = document.getElementById('totalCapacity');
    const imageInput = document.getElementById('image');
    const emailInput = document.getElementById('email');

    // Password validation events
    confirmPassword.addEventListener('input', validatePasswords);
    password.addEventListener('input', () => {
        validatePasswords();
        if (password.classList.contains('is-invalid')) {
            password.classList.remove('is-invalid');
        }
    });

    // Capacity validation events
    capacity.addEventListener('input', validateCapacity);
    totalCapacity.addEventListener('input', validateCapacity);

    // File input validation
    imageInput.addEventListener('change', validateFile);

    // Email change event - check if captcha is required
    if (emailInput) {
        emailInput.addEventListener('blur', checkCaptchaRequired);
    }

    // Real-time validation styling
    form.addEventListener('input', (e) => {
        if (e.target.checkValidity()) {
            setElementValidation(e.target, true);
        }
    });

    // Terms and conditions modal handler
    const termsLink = document.getElementById('termsLink');
    if (termsLink) {
        termsLink.addEventListener('click', function(e) {
            e.preventDefault();
            const modal = new bootstrap.Modal(document.getElementById('termsModal'));
            modal.show();
        });
    }

    // Form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        // Clear any existing errors
        hideError();

        const isValid = validateAllFields(form);

        if (!isValid) {
            focusFirstInvalidField(form);
            return false;
        }

        // Show loading state
        setSubmitButtonLoading(true);

        // Set timeout to re-enable button in case of slow response
        setTimeout(() => {
            setSubmitButtonLoading(false);
        }, 30000);

        // Submit the form
        form.submit();
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    handleUrlParameters();
    setupEventListeners();
});