window.CSRFUtils = {
    getCSRFToken: function() {
        return document.cookie
            .split('; ')
            .find(row => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] || '';
    },

    csrfFetch: async function(url, options = {}) {
        const defaults = {
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Merge options
        const config = {
            ...defaults,
            ...options,
            headers: {
                ...defaults.headers,
                ...options.headers
            }
        };

        // Add CSRF token for non-GET requests
        if (config.method && config.method.toUpperCase() !== 'GET') {
            const token = this.getCSRFToken();
            if (token) {
                config.headers['X-CSRF-Token'] = token;
            }
        }

        try {
            const response = await fetch(url, config);

            // Handle CSRF errors with retry
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.code === 'CSRF_TOKEN_INVALID') {
                    console.warn('CSRF token invalid, please refresh the page');
                }
            }

            return response;
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }
};

window.csrfFetch = window.CSRFUtils.csrfFetch.bind(window.CSRFUtils);