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
  
  //const query = `?people=${encodeURIComponent(people)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
  displayReservationAvailability(people, date, time);

}


// FILTER according to cusine/rating/prices
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








//  ======== ASYNC FUNCTIONS TO DISPLAY STORES / LOAD DATA  ======== //

// Load locations
async function loadLocations() {
  try {
    const response = await fetch('/available_locations');
    if (!response.ok) throw new Error('Failed to fetch locations');

    const locations = await response.json();
    const locationSelect = document.getElementById('locationSelect');

    locations.forEach(loc => {
      const option = document.createElement('option');
      option.value = loc;
      option.textContent = loc;
      locationSelect.appendChild(option);
    });

  } catch (err) {
    console.error('Error loading locations:', err);
  }
}


// display ALL stores
async function displayStores() {
    try {
        const response = await fetch('/displayallStores');
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');
        foodList.innerHTML = "";

        stores.forEach(store => {
        const card = document.createElement('div');
        card.classList.add('restaurant-card');

        // Restaurant Image
        const img = document.createElement('img');
        img.src = store.image;
        img.alt = store.storeName;
        card.appendChild(img);

        // Restaurant Info
        const infoDiv = document.createElement('div');
        infoDiv.classList.add('restaurant-info');

        const name = document.createElement('h4');
        name.innerText = store.storeName;
        infoDiv.appendChild(name);

        const location = document.createElement('p');
        location.innerText = store.location;
        infoDiv.appendChild(location);

        const cuisine = document.createElement('p');
        cuisine.innerText = store.cuisine;
        infoDiv.appendChild(cuisine);

        const price = document.createElement('p');
        price.innerText = "Price " + store.priceRange;
        infoDiv.appendChild(price);

        card.appendChild(infoDiv);

        // Rating Section
        const ratingDiv = document.createElement('div');
        ratingDiv.classList.add('rating-info');

        const averageRating = store.average_rating !== null ? parseFloat(store.average_rating).toFixed(1) : 'N/A';
        const reviewCount = store.review_count || 0;

        ratingDiv.innerHTML = `Rating: ${averageRating} <br/><small>(${reviewCount} reviews)</small>`;
        card.appendChild(ratingDiv);

        // Link to access this selected restaurant page [selectedRes.html]
        const link = document.createElement('a');
        link.href = `/selectedRes?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;
        link.style.textDecoration = 'none';
        link.style.color = 'inherit';

        link.appendChild(card); // 'card' is the .restaurant-card
        foodList.appendChild(link)
      });
    
    } catch (error) {
        console.error('Error:', error);
    }
}



// display Reservation Available stores
async function displayReservationAvailability(people, date, time) {
    try {
        const query = `?people=${encodeURIComponent(people)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
        const response = await fetch(`/display_by_ReservationAvailability${query}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const stores = await response.json();
        const foodList = document.getElementById('res-content');
        foodList.innerHTML = "";

        stores.forEach(store => {
          const card = document.createElement('div');
          card.classList.add('restaurant-card');

          // Restaurant Image
          const img = document.createElement('img');
          img.src = store.image;
          img.alt = store.storeName;
          card.appendChild(img);

          // Restaurant Info
          const infoDiv = document.createElement('div');
          infoDiv.classList.add('restaurant-info');

          const name = document.createElement('h4');
          name.innerText = store.storeName;
          infoDiv.appendChild(name);

          const location = document.createElement('p');
          location.innerText = store.location;
          infoDiv.appendChild(location);

          const cuisine = document.createElement('p');
          cuisine.innerText = store.cuisine;
          infoDiv.appendChild(cuisine);

          const price = document.createElement('p');
          price.innerText = "Price " + store.priceRange;
          infoDiv.appendChild(price);

          card.appendChild(infoDiv);

          // Rating Section
          const ratingDiv = document.createElement('div');
          ratingDiv.classList.add('rating-info');

          const averageRating = store.average_rating !== null ? parseFloat(store.average_rating).toFixed(1) : 'N/A';
          const reviewCount = store.review_count || 0;

          ratingDiv.innerHTML = `Rating: ${averageRating} <br/><small>(${reviewCount} reviews)</small>`;
          card.appendChild(ratingDiv);


          // Link to access this selected restaurant page [selectedRes.html]
          const link = document.createElement('a');
          link.href = `/selectedRes?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;
          link.style.textDecoration = 'none';
          link.style.color = 'inherit';

          link.appendChild(card); // 'card' is the .restaurant-card
          foodList.appendChild(link)
        });
    
    } catch (error) {
        console.error('Error:', error);
    }
}



// display FILTERED stores
async function displayFiltered(queryParams) {
  try {
    const response = await fetch(`/display_filtered_store?${queryParams.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch data');
    }

    const stores = await response.json();
    const foodList = document.getElementById('res-content');
    foodList.innerHTML = "";

    stores.forEach(store => {
      const card = document.createElement('div');
      card.classList.add('restaurant-card');

      // Restaurant Image
      const img = document.createElement('img');
      img.src = store.image;
      img.alt = store.storeName;
      card.appendChild(img);

      // Restaurant Info
      const infoDiv = document.createElement('div');
      infoDiv.classList.add('restaurant-info');

      const name = document.createElement('h4');
      name.innerText = store.storeName;
      infoDiv.appendChild(name);

      const location = document.createElement('p');
      location.innerText = store.location;
      infoDiv.appendChild(location);

      const cuisine = document.createElement('p');
      cuisine.innerText = store.cuisine;
      infoDiv.appendChild(cuisine);

      const price = document.createElement('p');
      price.innerText = "Price " + store.priceRange;
      infoDiv.appendChild(price);

      card.appendChild(infoDiv);

      // Rating Section
      const ratingDiv = document.createElement('div');
      ratingDiv.classList.add('rating-info');

      const averageRating = store.average_rating !== null ? parseFloat(store.average_rating).toFixed(1) : 'N/A';
      const reviewCount = store.review_count || 0;

      ratingDiv.innerHTML = `Rating: ${averageRating} <br/><small>(${reviewCount} reviews)</small>`;
      card.appendChild(ratingDiv);

      // Link to access this selected restaurant page [selectedRes.html]
      const link = document.createElement('a');
      link.href = `/selectedRes?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;
      link.style.textDecoration = 'none';
      link.style.color = 'inherit';

      link.appendChild(card);
      foodList.appendChild(link);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}
