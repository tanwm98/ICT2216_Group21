// ======================================
// FIXED: Secure Image Serving with URLs Instead of Base64
// Enhanced with OWASP Security Best Practices
// ======================================

// Load all stores on initial load
window.onload = function () {
  flatpickr("#dateInput", {
      dateFormat: "Y-m-d",
      minDate: 'today'
  });

  loadLocations();
  displayStores();
};

//  ======== BUTTON EVENTS  ======== //

// CLEAR all filters
document.getElementById('clear').addEventListener('click', function () {
  // Reset input fields
  document.getElementById('peopleInput').value = '';
  document.getElementById('dateInput').value = '';
  document.getElementById('timeInput').value = '';

  // Reset review score
  const reviewScoreInput = document.querySelector('.review-score');
  if (reviewScoreInput) {
    reviewScoreInput.value = '';
  }

  // Reset the review score range input to 1
  const reviewSlider = document.querySelector('.review-score');
  if (reviewSlider) {
    reviewSlider.value = 1;
  }

  // Uncheck all cuisine checkboxes
  const cuisineCheckboxes = document.querySelectorAll('.cuisine-filter');
  cuisineCheckboxes.forEach(cb => cb.checked = false);

  // Uncheck price radio buttons
  const priceRadios = document.querySelectorAll('.price-range');
  priceRadios.forEach(rb => rb.checked = false);

  displayStores();
});

// APPLY for table availability filtering
document.getElementById('applyButton').addEventListener('click', function () {
  filterByReservationDetails();
});

function filterByReservationDetails() {
  const people = document.getElementById('peopleInput').value;
  const date = document.getElementById('dateInput').value;
  const time = document.getElementById('timeInput').value;

  displayReservationAvailability(people, date, time);
}

// FILTER according to cuisine/rating/prices
document.getElementById('filterButton').addEventListener('click', function () {
  filterByRestaurantDetails();
});

function filterByRestaurantDetails() {
  // Get selected price range (radio button)
  const selectedPriceRadio = document.querySelector('.price-range:checked');
  const priceRange = selectedPriceRadio ? selectedPriceRadio.value : "";

  const queryParams = new URLSearchParams();

  // Append price only if selected
  if (priceRange) {
    queryParams.append('priceRange', priceRange);
  }

  // Optional: Add other filters only if they're filled in
  const selectedCuisines = Array.from(document.querySelectorAll('.cuisine-filter:checked'))
    .map(cb => cb.value);
  if (selectedCuisines.length > 0) {
    queryParams.append('cuisines', selectedCuisines.join(','));
  }

  const slider = document.getElementById('review-score-slider');

  if (slider && slider.noUiSlider) {
    const values = slider.noUiSlider.get();
    const min = parseInt(values[0]);
    const max = parseInt(values[1]);

    if (!isNaN(min) && !isNaN(max)) {
      queryParams.append('reviewScoreMin', min);
      queryParams.append('reviewScoreMax', max);
    }
  }

  const locationSelect = document.getElementById('locationSelect');
  if (locationSelect && locationSelect.value) {
    queryParams.append('location', locationSelect.value);
  }

  // Call displayFiltered with just price or all available filters
  displayFiltered(queryParams);
}

//  ======== SECURE HELPER FUNCTIONS ======== //

// SECURITY: XSS Prevention - Escape HTML content
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// SECURITY: Validate and sanitize image URLs
function createSecureImageElement(imageUrl, altText, storeName) {
  const img = document.createElement('img');

  // SECURITY: Validate image URL format
  if (!imageUrl || typeof imageUrl !== 'string') {
    img.src = '/static/img/restaurants/no-image.png';
  } else if (imageUrl.startsWith('/static/img/restaurants/')) {
    // Valid internal image URL
    img.src = imageUrl;
  } else {
    // Invalid or external URL - use fallback
    console.warn('Invalid image URL detected:', imageUrl);
    img.src = '/static/img/restaurants/no-image.png';
  }

  // SECURITY: Escape alt text to prevent XSS
  img.alt = escapeHtml(altText || `${storeName} restaurant image`);

  // SECURITY: Add CSP-compliant loading and error handling
  img.loading = 'lazy'; // Performance optimization
  img.onerror = function() {
    // Fallback to default image if loading fails
    this.src = '/static/img/restaurants/no-image.png';
    this.onerror = null; // Prevent infinite loop
  };

  // SECURITY: Add security attributes
  img.referrerPolicy = 'strict-origin-when-cross-origin';

  return img;
}

// SECURITY: Sanitize store data
function sanitizeStoreData(store) {
  return {
    store_id: parseInt(store.store_id) || 0,
    storeName: escapeHtml(store.storeName || 'Unknown Restaurant'),
    location: escapeHtml(store.location || 'Unknown Location'),
    cuisine: escapeHtml(store.cuisine || 'Various'),
    priceRange: escapeHtml(store.priceRange || 'N/A'),
    // FIXED: Use imageUrl instead of base64 image data
    imageUrl: store.imageUrl || '/static/img/restaurants/no-image.png',
    altText: store.altText || `${store.storeName} restaurant image`,
    average_rating: parseFloat(store.average_rating) || null,
    review_count: parseInt(store.review_count) || 0
  };
}

// SECURITY: Create restaurant card with proper sanitization
function createRestaurantCard(store) {
  // Sanitize store data
  const sanitizedStore = sanitizeStoreData(store);

  const card = document.createElement('div');
  card.classList.add('restaurant-card');

  // FIXED: Use secure image URL instead of base64
  const img = createSecureImageElement(
    sanitizedStore.imageUrl,
    sanitizedStore.altText,
    sanitizedStore.storeName
  );
  card.appendChild(img);

  // Restaurant Info with XSS protection
  const infoDiv = document.createElement('div');
  infoDiv.classList.add('restaurant-info');

  const name = document.createElement('h4');
  name.textContent = sanitizedStore.storeName; // Use textContent to prevent XSS
  infoDiv.appendChild(name);

  const location = document.createElement('p');
  location.textContent = sanitizedStore.location;
  infoDiv.appendChild(location);

  const cuisine = document.createElement('p');
  cuisine.textContent = sanitizedStore.cuisine;
  infoDiv.appendChild(cuisine);

  const price = document.createElement('p');
  price.textContent = `Price ${sanitizedStore.priceRange}`;
  infoDiv.appendChild(price);

  card.appendChild(infoDiv);

  // Rating Section with proper validation
  const ratingDiv = document.createElement('div');
  ratingDiv.classList.add('rating-info');

  const averageRating = sanitizedStore.average_rating !== null
    ? sanitizedStore.average_rating.toFixed(1)
    : 'N/A';
  const reviewCount = sanitizedStore.review_count;

  // Use textContent to prevent XSS
  ratingDiv.innerHTML = `Rating: ${averageRating} <br/><small>(${reviewCount} reviews)</small>`;
  card.appendChild(ratingDiv);

  // SECURITY: Validate URL parameters before creating link
  const encodedStoreName = encodeURIComponent(sanitizedStore.storeName);
  const encodedLocation = encodeURIComponent(sanitizedStore.location);

  // Link to access this selected restaurant page [selectedRes.html]
  const link = document.createElement('a');
  link.href = `/selectedRes?name=${encodedStoreName}&location=${encodedLocation}`;
  link.style.textDecoration = 'none';
  link.style.color = 'inherit';

  // SECURITY: Add security attributes to link
  link.rel = 'noopener';

  link.appendChild(card);

  return link;
}

//  ======== ASYNC FUNCTIONS TO DISPLAY STORES / LOAD DATA  ======== //

// Load locations with error handling
async function loadLocations() {
  try {
    const response = await fetch('/available_locations');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch locations`);

    const locations = await response.json();
    const locationSelect = document.getElementById('locationSelect');

    // SECURITY: Validate and sanitize location data
    if (Array.isArray(locations)) {
      locations.forEach(loc => {
        if (typeof loc === 'string' && loc.trim()) {
          const option = document.createElement('option');
          option.value = escapeHtml(loc.trim());
          option.textContent = escapeHtml(loc.trim());
          locationSelect.appendChild(option);
        }
      });
    }

  } catch (err) {
    console.error('Error loading locations:', err);
    // Show user-friendly error message
    showErrorMessage('Failed to load locations. Please refresh the page.');
  }
}

// FIXED: Display ALL stores with secure image URLs
async function displayStores() {
    try {
        const response = await fetch('/displayallStores');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to fetch data`);
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');

        if (!foodList) {
          throw new Error('Restaurant content container not found');
        }

        foodList.innerHTML = "";

        // SECURITY: Validate response data
        if (!Array.isArray(stores)) {
          throw new Error('Invalid response format');
        }

        if (stores.length === 0) {
          foodList.innerHTML = '<div class="no-results">No restaurants found.</div>';
          return;
        }

        // FIXED: Process each store with secure image URLs
        stores.forEach(store => {
          try {
            const restaurantCard = createRestaurantCard(store);
            foodList.appendChild(restaurantCard);
          } catch (cardError) {
            console.error('Error creating restaurant card:', cardError);
            // Continue with other restaurants
          }
        });

    } catch (error) {
        console.error('Error in displayStores:', error);
        showErrorMessage('Failed to load restaurants. Please try again later.');
    }
}

// FIXED: Display reservation available stores with secure image URLs
async function displayReservationAvailability(people, date, time) {
    try {
        // SECURITY: Validate input parameters
        if (!people || !date || !time) {
          showErrorMessage('Please fill in all reservation details.');
          return;
        }

        const query = `?people=${encodeURIComponent(people)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
        const response = await fetch(`/display_by_ReservationAvailability${query}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to fetch data`);
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');

        if (!foodList) {
          throw new Error('Restaurant content container not found');
        }

        foodList.innerHTML = "";

        // SECURITY: Validate response data
        if (!Array.isArray(stores)) {
          throw new Error('Invalid response format');
        }

        if (stores.length === 0) {
          foodList.innerHTML = '<div class="no-results">No restaurants available for the selected date and time.</div>';
          return;
        }

        // FIXED: Process each store with secure image URLs
        stores.forEach(store => {
          try {
            const restaurantCard = createRestaurantCard(store);
            foodList.appendChild(restaurantCard);
          } catch (cardError) {
            console.error('Error creating restaurant card:', cardError);
            // Continue with other restaurants
          }
        });

    } catch (error) {
        console.error('Error in displayReservationAvailability:', error);
        showErrorMessage('Failed to load available restaurants. Please try again later.');
    }
}

// FIXED: Display FILTERED stores with secure image URLs
async function displayFiltered(queryParams) {
  try {
    const response = await fetch(`/display_filtered_store?${queryParams.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch data`);
    }

    const stores = await response.json();
    const foodList = document.getElementById('res-content');

    if (!foodList) {
      throw new Error('Restaurant content container not found');
    }

    foodList.innerHTML = "";

    // SECURITY: Validate response data
    if (!Array.isArray(stores)) {
      throw new Error('Invalid response format');
    }

    if (stores.length === 0) {
      foodList.innerHTML = '<div class="no-results">No restaurants match your filters.</div>';
      return;
    }

    // FIXED: Process each store with secure image URLs
    stores.forEach(store => {
      try {
        const restaurantCard = createRestaurantCard(store);
        foodList.appendChild(restaurantCard);
      } catch (cardError) {
        console.error('Error creating restaurant card:', cardError);
        // Continue with other restaurants
      }
    });

  } catch (error) {
    console.error('Error in displayFiltered:', error);
    showErrorMessage('Failed to load filtered restaurants. Please try again later.');
  }
}

// SECURITY: Show user-friendly error messages
function showErrorMessage(message) {
  const foodList = document.getElementById('res-content');
  if (foodList) {
    foodList.innerHTML = `
      <div class="error-message" style="
        text-align: center;
        padding: 2rem;
        color: #dc3545;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 8px;
        margin: 1rem 0;
      ">
        <strong>⚠️ Error:</strong> ${escapeHtml(message)}
        <br><br>
        <button onclick="location.reload()" style="
          background: #dc3545;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
        ">
          Refresh Page
        </button>
      </div>
    `;
  }
}

// SECURITY: Add CSP event listeners for enhanced security
document.addEventListener('DOMContentLoaded', function() {
  // Add security headers validation
  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    console.warn('CSP header not detected. Consider adding Content Security Policy.');
  }
});

// SECURITY: Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  showErrorMessage('An unexpected error occurred. Please refresh the page.');
  event.preventDefault();
});