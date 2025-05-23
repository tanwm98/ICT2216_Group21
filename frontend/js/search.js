
window.onload = function () {
  displayStores(); // Load all stores on initial load
};


document.getElementById('applyButton').addEventListener('click', function () {
  filterByReservationDetails();
});

function filterByReservationDetails() {
  const people = document.getElementById('peopleInput').value;
  const date = document.getElementById('dateInput').value;
  const time = document.getElementById('timeInput').value;
  
  //const query = `?people=${encodeURIComponent(people)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
  displayFiltered(people, date, time);

  
}



async function displayStores() {
    try {
        const response = await fetch('http://localhost:3000/displayallStores');
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
            const ratingValue = store.rating !== undefined ? store.rating : 'N/A';
            const reviewText = store.reviewCount !== undefined ? `${store.reviewCount} reviews` : 'No reviews';

            ratingDiv.innerHTML = `${ratingValue}<br/><small>${reviewText}</small>`;
            card.appendChild(ratingDiv);

            const link = document.createElement('a');
            link.href = `selectedRes.html?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;
            link.style.textDecoration = 'none';
            link.style.color = 'inherit';

            link.appendChild(card); // 'card' is the .restaurant-card
            foodList.appendChild(link)
        });



    

    
    } catch (error) {
        console.error('Error:', error);
    }
}



async function displayFiltered(people, date, time) {
    try {
        const query = `?people=${encodeURIComponent(people)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
        const response = await fetch(`http://localhost:3000/display_filtered_store${query}`);
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
            const ratingValue = store.rating !== undefined ? store.rating : 'N/A';
            const reviewText = store.reviewCount !== undefined ? `${store.reviewCount} reviews` : 'No reviews';

            ratingDiv.innerHTML = `${ratingValue}<br/><small>${reviewText}</small>`;
            card.appendChild(ratingDiv);

            const link = document.createElement('a');
            link.href = `selectedRes.html?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;
            link.style.textDecoration = 'none';
            link.style.color = 'inherit';

            link.appendChild(card); // 'card' is the .restaurant-card
            foodList.appendChild(link)
        });
    
    } catch (error) {
        console.error('Error:', error);
    }
}


