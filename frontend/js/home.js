// Global pagination state
let currentPage = 1;
const itemsPerPage = 6;
let totalPages = 1;

async function displayStores(page = 1) {
    const foodList = document.getElementById('post-content');
    if (!foodList) {
        console.error('Element with ID "post-content" not found');
        return;
    }

    foodList.innerHTML = '<div class="loading-spinner text-center p-4"><div class="spinner-border" role="status"><span class="sr-only"></span></div></div>';

    try {
        const response = await fetch(`/displayStores?page=${page}&limit=${itemsPerPage}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Validate response data structure
        if (!data.stores || !Array.isArray(data.stores)) {
            throw new Error('Invalid response format: expected stores array');
        }

        // Update pagination state
        currentPage = data.pagination.currentPage;
        totalPages = data.pagination.totalPages;

        // Clear loading state
        foodList.innerHTML = "";

        // Create container for stores and pagination
        const containerDiv = document.createElement('div');
        containerDiv.className = 'restaurants-container';

        // Create stores row
        const storesRow = document.createElement('div');
        storesRow.className = 'row';
        storesRow.id = 'stores-grid';

        // Performance optimization: Use DocumentFragment for batching DOM operations
        const fragment = document.createDocumentFragment();

        // Batch process stores for better performance
        data.stores.forEach(store => {
            // Input validation and sanitization
            if (!isValidStore(store)) {
                console.warn('Invalid store data detected, skipping:', store);
                return;
            }

            const storeElement = createStoreElement(store);
            fragment.appendChild(storeElement);
        });

        // Single DOM operation for better performance
        storesRow.appendChild(fragment);
        containerDiv.appendChild(storesRow);

        // Add pagination controls
        const paginationDiv = createPaginationControls(data.pagination);
        containerDiv.appendChild(paginationDiv);

        foodList.appendChild(containerDiv);

        // Initialize lazy loading for images after DOM is updated
        initializeLazyLoading();

        // Scroll to top of results
        foodList.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        handleDisplayError(error, foodList);
    }
}

// Create pagination controls
function createPaginationControls(pagination) {
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-container d-flex justify-content-center align-items-center mt-4 mb-4';

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Restaurant pagination');

    const ul = document.createElement('ul');
    ul.className = 'pagination mb-0';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${!pagination.hasPrevPage ? 'disabled' : ''}`;

    const prevLink = document.createElement('a');
    prevLink.className = 'page-link';
    prevLink.href = '#';
    prevLink.textContent = 'Previous';
    prevLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (pagination.hasPrevPage) {
            displayStores(currentPage - 1);
        }
    });

    prevLi.appendChild(prevLink);
    ul.appendChild(prevLi);

    // Page numbers (show max 5 pages)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);

    // Add first page if we're not showing it
    if (startPage > 1) {
        const firstLi = createPageItem(1, 1 === currentPage);
        ul.appendChild(firstLi);

        if (startPage > 2) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = '<span class="page-link">...</span>';
            ul.appendChild(ellipsisLi);
        }
    }

    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        const pageLi = createPageItem(i, i === currentPage);
        ul.appendChild(pageLi);
    }

    // Add last page if we're not showing it
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = '<span class="page-link">...</span>';
            ul.appendChild(ellipsisLi);
        }

        const lastLi = createPageItem(totalPages, totalPages === currentPage);
        ul.appendChild(lastLi);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${!pagination.hasNextPage ? 'disabled' : ''}`;

    const nextLink = document.createElement('a');
    nextLink.className = 'page-link';
    nextLink.href = '#';
    nextLink.textContent = 'Next';
    nextLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (pagination.hasNextPage) {
            displayStores(currentPage + 1);
        }
    });

    nextLi.appendChild(nextLink);
    ul.appendChild(nextLi);

    nav.appendChild(ul);
    paginationDiv.appendChild(nav);

    // Add pagination info
    const infoDiv = document.createElement('div');
    infoDiv.className = 'pagination-info text-center mt-2';
    const showing = Math.min(pagination.limit, pagination.totalStores - (currentPage - 1) * pagination.limit);
    const start = (currentPage - 1) * pagination.limit + 1;
    const end = start + showing - 1;

    infoDiv.innerHTML = `
        <small class="text-muted">
            Showing ${start} to ${end} of ${pagination.totalStores} restaurants
        </small>
    `;

    paginationDiv.appendChild(infoDiv);

    return paginationDiv;
}

// Helper function to create page item
function createPageItem(pageNum, isActive) {
    const li = document.createElement('li');
    li.className = `page-item ${isActive ? 'active' : ''}`;

    const link = document.createElement('a');
    link.className = 'page-link';
    link.href = '#';
    link.textContent = pageNum;

    if (isActive) {
        link.setAttribute('aria-current', 'page');
    }

    link.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isActive) {
            displayStores(pageNum);
        }
    });

    li.appendChild(link);
    return li;
}

// ======================================
// HELPER FUNCTIONS (Keep existing ones)
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

                        // Add error handler for lazy-loaded images
                        function handleLazyImageError() {
                            this.src = '/static/img/restaurants/no-image.png';
                            this.removeEventListener('error', handleLazyImageError);
                        }
                        img.addEventListener('error', handleLazyImageError);

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

                // Add error handler for fallback images
                function handleFallbackImageError() {
                    this.src = '/static/img/restaurants/no-image.png';
                    this.removeEventListener('error', handleFallbackImageError);
                }
                img.addEventListener('error', handleFallbackImageError);
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
        // Fixed: Use named function instead of anonymous function for better debugging
        function handleRetryClick() {
            displayStores(currentPage);
        }
        retryButton.addEventListener('click', handleRetryClick);
    }
}

function initializePageLoad() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(() => displayStores(1));
        });
    } else {
        requestAnimationFrame(() => displayStores(1));
    }
}

window.onload = function() {
    try {
        initializePageLoad();
    } catch (error) {
        console.error('Failed to initialize page:', error);
        // Fallback to basic load
        displayStores(1);
    }
};

// Cache implementation (keep existing cache code if needed)
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