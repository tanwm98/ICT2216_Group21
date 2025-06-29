        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            console.log('Login page loaded. error param:', urlParams.get('error'), 'success param:', urlParams.get('success'));

            if (urlParams.has('error')) {
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