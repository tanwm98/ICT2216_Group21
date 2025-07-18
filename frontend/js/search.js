window.onload = function() {
    flatpickr("#dateInput", {
        dateFormat: "Y-m-d",
        minDate: 'today'
    });

    void loadLocations();
    void displayStores();
    // Initialize the review score slider
    const slider = document.getElementById('review-score-slider');
    const reviewScoreDisplay = document.querySelector('.review-score-display');

    noUiSlider.create(slider, {
        start: [1, 5], // Initial values
        connect: true,
        step: 1,
        range: {
            'min': 1,
            'max': 5
        },
        format: {
            to: value => Math.round(value),
            from: value => Number(value)
        }
    });

    // Update display when slider changes
    slider.noUiSlider.on('update', function(values) {
        const [min, max] = values.map(v => parseInt(v));
        reviewScoreDisplay.textContent = `Rating: ${min} - ${max}`;
    });

    // Export values for filtering
    slider.noUiSlider.on('change', function(values) {
        const [min, max] = values.map(v => parseInt(v));
        console.log(`Review score range: ${min} - ${max}`);
    });
};

function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;
    
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

// CLEAR all filters
document.getElementById('clear').addEventListener('click', function() {
    // Reset input fields
    document.getElementById('peopleInput').value = '';
    document.getElementById('dateInput').value = '';
    document.getElementById('timeInput').value = '';

    // Reset review score slider
    const slider = document.getElementById('review-score-slider');
    if (slider && slider.noUiSlider) {
        slider.noUiSlider.set([1, 5]);
    }

    // Uncheck all cuisine checkboxes
    const cuisineCheckboxes = document.querySelectorAll('.cuisine-filter');
    cuisineCheckboxes.forEach(cb => cb.checked = false);

    // Uncheck price radio buttons
    const priceRadios = document.querySelectorAll('.price-range');
    priceRadios.forEach(rb => rb.checked = false);

    // Reset location dropdown
    const locationSelect = document.getElementById('locationSelect');
    if (locationSelect) {
        locationSelect.value = '';
    }

    displayStores();
});

// APPLY for table availability filtering - IMPROVED UX
document.getElementById('applyButton').addEventListener('click', function() {
    filterByReservationDetails();
});

function filterByReservationDetails() {
    const people = document.getElementById('peopleInput').value;
    const date = document.getElementById('dateInput').value;
    const time = document.getElementById('timeInput').value;

    if (!people || !date || !time) {
        showMessage('Please fill in all reservation details (people, date, and time).', 'warning');
        return;
    }

    void displayReservationAvailability(people, date, time);
}

// FILTER according to cuisine/rating/prices
document.getElementById('filterButton').addEventListener('click', function() {
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

//  ======== HELPER FUNCTIONS ======== //

// SECURITY: Create restaurant card with proper sanitization
function createRestaurantCard(store) {
    const card = document.createElement('div');
    card.classList.add('restaurant-card');

    // Create image element
    const img = document.createElement('img');

    // FIXED: Use imageUrl from backend response (now includes proper /static/img/restaurants/ path)
    if (store.imageUrl && store.imageUrl.startsWith('/static/img/restaurants/')) {
        img.src = store.imageUrl;
    } else {
        img.src = '/static/img/restaurants/no-image.png';
    }

    img.alt = store.altText || `${store.storeName} restaurant image`;
    img.loading = 'lazy';

    // Fixed: Use named function reference instead of arguments.callee
    function handleImageError() {
        this.src = '/static/img/restaurants/no-image.png';
        this.removeEventListener('error', handleImageError);
    }

    img.addEventListener('error', handleImageError);

    card.appendChild(img);

    const decodedStoreName = decodeHtmlEntities(store.storeName || 'Unknown Restaurant');
    const decodedLocation = decodeHtmlEntities(store.location || 'Unknown Location');
    const decodedCuisine = decodeHtmlEntities(store.cuisine || 'Various');
    const decodedPriceRange = decodeHtmlEntities(store.priceRange || 'N/A');
    // Restaurant Info
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('restaurant-info');

    const name = document.createElement('h4');
    name.textContent = decodedStoreName;
    infoDiv.appendChild(name);

    const location = document.createElement('p');
    location.textContent = `Located at ${decodedLocation}`;
    infoDiv.appendChild(location);

    const cuisine = document.createElement('p');
    cuisine.textContent = `${decodedCuisine} Restaurant`;
    infoDiv.appendChild(cuisine);

    const price = document.createElement('p');
    price.textContent = `Price ${decodedPriceRange}`;
    infoDiv.appendChild(price);

    card.appendChild(infoDiv);

    // Rating Section
    const ratingDiv = document.createElement('div');
    ratingDiv.classList.add('rating');

    if (store.average_rating && store.review_count > 0) {
        const averageRating = parseFloat(store.average_rating).toFixed(1);
        const reviewCount = parseInt(store.review_count);

        ratingDiv.textContent = `${averageRating}/5`;
        const br = document.createElement('br');
        ratingDiv.appendChild(br);
        const reviewText = document.createElement('small');
        reviewText.textContent = `${reviewCount} reviews`;
        ratingDiv.appendChild(reviewText);
    } else {
        ratingDiv.textContent = 'N/A';
        const br = document.createElement('br');
        ratingDiv.appendChild(br);
        const reviewText = document.createElement('small');
        reviewText.textContent = 'No reviews';
        ratingDiv.appendChild(reviewText);
    }

    card.appendChild(ratingDiv);

    // Link to restaurant details page
    const link = document.createElement('a');
    link.href = `/selectedRes?name=${encodeURIComponent(decodedStoreName)}&location=${encodeURIComponent(decodedLocation)}`;
    link.className = 'restaurant-link';
    link.rel = 'noopener';
    link.appendChild(card);

    return link;
}

//  ======== ASYNC FUNCTIONS TO DISPLAY STORES / LOAD DATA  ======== //

// Load locations
async function loadLocations() {
    try {
        const response = await fetch('/available_locations');
        if (!response.ok) throw new Error(`Failed to fetch locations`);

        const locations = await response.json();
        const locationSelect = document.getElementById('locationSelect');

        if (Array.isArray(locations)) {
            locations.forEach(loc => {
                if (typeof loc === 'string' && loc.trim()) {
                    const option = document.createElement('option');
                    option.value = loc.trim();
                    const decodedLocation = decodeHtmlEntities(loc.trim());
                    option.textContent = decodedLocation;
                    locationSelect.appendChild(option);
                }
            });
        }

    } catch (err) {
        console.error('Error loading locations:', err);
        showMessage('Failed to load locations. Please refresh the page.', 'error');
    }
}

// Display ALL stores
async function displayStores() {
    try {
        showLoading();

        const response = await fetch('/displayallStores');
        if (!response.ok) {
            throw new Error(`Failed to fetch data`);
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');

        foodList.innerHTML = "";

        if (!Array.isArray(stores) || stores.length === 0) {
            showMessage('No restaurants found.', 'info');
            return;
        }

        stores.forEach(store => {
            try {
                const restaurantCard = createRestaurantCard(store);
                foodList.appendChild(restaurantCard);
            } catch (cardError) {
                console.error('Error creating restaurant card:', cardError);
            }
        });

    } catch (error) {
        console.error('Error in displayStores:', error);
        showMessage('Failed to load restaurants. Please try again later.', 'error');
    }
}

// Display reservation available stores
async function displayReservationAvailability(people, date, time) {
    try {
        showLoading();

        const query = `?people=${encodeURIComponent(people)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
        const response = await fetch(`/display_by_ReservationAvailability${query}`);

        if (!response.ok) {
            if (response.status === 400) {
                const errorData = await response.json();
                showMessage(`Please check your input: ${errorData.errors ? errorData.errors.join(', ') : 'Invalid reservation details.'}`, 'warning');
                return;
            }
            throw new Error(`Failed to fetch data`);
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');

        foodList.innerHTML = "";

        if (!Array.isArray(stores) || stores.length === 0) {
            showMessage(`No restaurants available for ${people} people on ${date} at ${time}. Try different date/time or fewer people.`, 'info');
            return;
        }

        showMessage(`Found ${stores.length} restaurant(s) available for your reservation`, 'success');

        stores.forEach(store => {
            try {
                const restaurantCard = createRestaurantCard(store);
                foodList.appendChild(restaurantCard);
            } catch (cardError) {
                console.error('Error creating restaurant card:', cardError);
            }
        });

    } catch (error) {
        console.error('Error in displayReservationAvailability:', error);
        showMessage('Failed to check restaurant availability. Please try again later.', 'error');
    }
}

// Display FILTERED stores
async function displayFiltered(queryParams) {
    try {
        showLoading();

        const response = await fetch(`/display_filtered_store?${queryParams.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch data`);
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');

        foodList.innerHTML = "";

        if (!Array.isArray(stores) || stores.length === 0) {
            showMessage('No restaurants match your filters. Try adjusting your criteria.', 'info');
            return;
        }

        showMessage(`Found ${stores.length} restaurant(s) matching your filters`, 'success');

        stores.forEach(store => {
            try {
                const restaurantCard = createRestaurantCard(store);
                foodList.appendChild(restaurantCard);
            } catch (cardError) {
                console.error('Error creating restaurant card:', cardError);
            }
        });

    } catch (error) {
        console.error('Error in displayFiltered:', error);
        showMessage('Failed to load filtered restaurants. Please try again later.', 'error');
    }
}

function showMessage(message, type = 'info') {
    const foodList = document.getElementById('res-content');
    if (foodList) {
        let alertClass = 'alert ';
        switch (type) {
            case 'error':
                alertClass += 'alert-danger';
                break;
            case 'warning':
                alertClass += 'alert-warning';
                break;
            case 'success':
                alertClass += 'alert-success';
                break;
            default:
                alertClass += 'alert-info';
                break;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `${alertClass} message-box`;
        messageDiv.innerHTML = message;

        if (type === 'error') {
            const br1 = document.createElement('br');
            const br2 = document.createElement('br');
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'btn btn-danger btn-sm';
            refreshBtn.textContent = 'Refresh Page';
            refreshBtn.addEventListener('click', () => location.reload());

            messageDiv.appendChild(br1);
            messageDiv.appendChild(br2);
            messageDiv.appendChild(refreshBtn);
        }

        foodList.innerHTML = '';
        foodList.appendChild(messageDiv);
    }
}

function showLoading() {
    const foodList = document.getElementById('res-content');
    if (foodList) {
        foodList.innerHTML = `    
      <div class="loading-container">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Loading restaurants...</p>
      </div>
    `;
    }
}