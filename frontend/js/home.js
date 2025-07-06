async function displayStores() {
    const foodList = document.getElementById('post-content');
    if (!foodList) {
        console.error('Element with ID "post-content" not found');
        return;
    }

    foodList.innerHTML = '<div class="loading-spinner text-center p-4"><div class="spinner-border" role="status"><span class="sr-only"></span></div></div>';

    try {
        const response = await fetch('/displayStores', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const stores = await response.json();

        // Validate response data
        if (!Array.isArray(stores)) {
            throw new Error('Invalid response format: expected array');
        }

        // Clear loading state
        foodList.innerHTML = "";

        // Performance optimization: Use DocumentFragment for batching DOM operations
        const fragment = document.createDocumentFragment();

        // Batch process stores for better performance
        stores.forEach(store => {
            // Input validation and sanitization
            if (!isValidStore(store)) {
                console.warn('Invalid store data detected, skipping:', store);
                return;
            }

            const storeElement = createStoreElement(store);
            fragment.appendChild(storeElement);
        });

        // Single DOM operation for better performance
        foodList.appendChild(fragment);

        // Initialize lazy loading for images after DOM is updated
        initializeLazyLoading();

    } catch (error) {
        handleDisplayError(error, foodList);
    }
}

// ======================================
// HELPER FUNCTIONS
// ======================================

// Input validation function for security - UPDATED for imageUrl
function isValidStore(store) {
    const requiredFields = ['storeName', 'location', 'cuisine', 'priceRange', 'imageUrl'];
    return requiredFields.every(field =>
        store.hasOwnProperty(field) &&
        typeof store[field] === 'string' &&
        store[field].trim().length > 0
    );
}

// Secure HTML escaping to prevent XSS
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createStoreElement(store) {
    const safeName = escapeHtml(store.storeName);
    const safeLocation = escapeHtml(store.location);
    const safeCuisine = escapeHtml(store.cuisine);
    const safePriceRange = escapeHtml(store.priceRange);
    const safeAltText = escapeHtml(store.altText || 'Restaurant image');
    const safeRating = store.average_rating ? parseFloat(store.average_rating).toFixed(1) : 'N/A';
    const reviewCount = parseInt(store.review_count) || 0;

    // Create URL parameters securely
    const storeUrl = `/selectedRes?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;

    // Create container div
    const colDiv = document.createElement('div');
    colDiv.className = 'col-12 col-md-6 col-lg-4 mb-4';

    // Use template string with proper imageUrl handling
    colDiv.innerHTML = `
        <div class="single-post wow fadeInUp" data-wow-delay="0.1s">
            <div class="post-image">
                <a href="${storeUrl}">
                    <img
                        class="lazy-load restaurant-card-image"
                        data-src="${store.imageUrl}"
                        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='350' height='230'%3E%3Crect width='100%25' height='100%25' fill='%23f8f9fa'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%236c757d'%3ELoading...%3C/text%3E%3C/svg%3E"
                        alt="${safeAltText}"
                        loading="lazy"
                    />
                </a>
            </div>
            <a href="${storeUrl}">
                <h4>${safeName}</h4>
            </a>
            <div class="d-flex justify-content-between">
                <div>
                    <p>Cuisine: ${safeCuisine}</p>
                    <p>Location: ${safeLocation}</p>
                    <p>Price Range: ${safePriceRange}</p>
                </div>
                <div>
                    <p>Rating: ${safeRating} (${reviewCount} reviews)</p>
                </div>
            </div>
        </div>
    `;

    return colDiv;
}

// Lazy loading implementation for better performance
function initializeLazyLoading() {
    // Use Intersection Observer for efficient lazy loading
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.getAttribute('data-src');
                    if (src) {
                        img.src = src;
                        img.classList.remove('lazy-load');
                        img.classList.add('loaded');
                        observer.unobserve(img);
                    }
                }
            });
        }, {
            rootMargin: '50px 0px',
            threshold: 0.1
        });

        document.querySelectorAll('.lazy-load').forEach(img => {
            imageObserver.observe(img);
        });
    } else {
        // Fallback for browsers without Intersection Observer
        document.querySelectorAll('.lazy-load').forEach(img => {
            const src = img.getAttribute('data-src');
            if (src) {
                img.src = src;
                img.classList.remove('lazy-load');
                img.classList.add('loaded');
            }
        });
    }
}

// Enhanced error handling
function handleDisplayError(error, container) {
    console.error('Error loading stores:', error);

    // Determine error type for user-friendly messaging
    let errorMessage = 'Unable to load restaurants at this time.';

    if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network connection error. Please check your internet connection.';
    } else if (error.message.includes('HTTP error')) {
        errorMessage = 'Server error occurred. Please try again later.';
    } else if (error.message.includes('Invalid response')) {
        errorMessage = 'Data format error. Please contact support if this persists.';
    }

    // Display user-friendly error message
    container.innerHTML = `
        <div class="col-12 text-center p-5">
            <div class="alert alert-warning" role="alert">
                <h4>Oops! Something went wrong</h4>
                <p class="mb-3">${escapeHtml(errorMessage)}</p>
                <button id="retry-load-btn" class="btn btn-primary">Try Again</button>
            </div>
        </div>
    `;
    const retryButton = document.getElementById('retry-load-btn');
    if (retryButton) {
        retryButton.addEventListener('click', displayStoresWithCache);
    }
}

function initializePageLoad() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(displayStores);
        });
    } else {
        requestAnimationFrame(displayStores);
    }
}

window.onload = function() {

    try {
        initializePageLoad();
    } catch (error) {
        console.error('Failed to initialize page:', error);
        // Fallback to basic load
        displayStores();
    }
};

class StoreCache {
    constructor(ttl = 5 * 60 * 1000) { // 5 minutes TTL
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return item.data;
    }

    clear() {
        this.cache.clear();
    }
}

const storeCache = new StoreCache();

async function displayStoresWithCache() {
    const cached = storeCache.get('stores');
    if (cached) {
        renderStores(cached);
        return;
    }

    try {
        const response = await fetch('/displayStores');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const stores = await response.json();
        storeCache.set('stores', stores);
        renderStores(stores);

    } catch (error) {
        handleDisplayError(error, document.getElementById('post-content'));
    }
}

function renderStores(stores) {
    const foodList = document.getElementById('post-content');
    if (!foodList) return;

    foodList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    stores.forEach(store => {
        if (isValidStore(store)) {
            fragment.appendChild(createStoreElement(store));
        }
    });
    foodList.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG') {
            e.target.src = '/static/img/restaurants/no-image.png';
        }
    }, true);
    foodList.appendChild(fragment);
    initializeLazyLoading();
}