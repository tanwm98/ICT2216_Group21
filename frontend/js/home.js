async function displayStores() {
    try {
        const response = await fetch('http://localhost:3000/displayStores'); // Fetch data from Express API
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const stores = await response.json();  // Parse the JSON response

        const foodList = document.getElementById('post-content');
        foodList.innerHTML = "";

        stores.forEach(store => {

            // div for col layout
            const colDiv = document.createElement('div');
            colDiv.classList.add('col-12', 'col-md-6', 'col-lg-4', 'mb-4'); // mb-4 for spacing between rows

            // inner wrapper div to hold store info
            const singlePost = document.createElement('div');
            singlePost.classList.add('single-post', 'wow', 'fadeInUp');
            singlePost.setAttribute('data-wow-delay', '0.1s');

            // image div 
            const imgDiv = document.createElement('div');
            imgDiv.classList.add('post-image');

            // creating <a> tag for image
            const link = document.createElement('a');
            link.href = store.link || '#';

            // creating img tag inside img div
            const img = document.createElement('img');
            img.style.width = "350px";
            img.style.height = "230px";
            img.style.objectFit = "cover";
            img.src = store.image;
            img.alt = 'Post Image';

            // creating div tag for store name
            const name = document.createElement('a');
            name.href = '#';
            const nameHeader = document.createElement('h4'); // <a> <h4> </h4> </a> 
            nameHeader.innerHTML = store.storeName;
            name.appendChild(nameHeader);

            // div tag for cuisine, location, price and rating
            const details = document.createElement('div');
            // add styling for details div 
            details.classList.add('d-flex', 'justify-content-between');

            const detailsChild = document.createElement('div');
            const ratingDiv = document.createElement('div');

            const cuisine = document.createElement('p');
            cuisine.innerHTML = "Cuisine: " + store.cuisine;

            const location = document.createElement('p');
            location.innerHTML = "Location: " + store.location;

            const priceRange = document.createElement('p');
            priceRange.innerHTML = "Price Range: " + store.priceRange;

            const rating = document.createElement('p');
            rating.innerHTML = "Rating: " + store.rating;

            // append can multiple , appendChild only 1
            detailsChild.append(cuisine, location, priceRange);
            ratingDiv.appendChild(rating);
            details.append(detailsChild, rating); // add the details into the parent div


            link.appendChild(img); // <a><img></a>
            imgDiv.appendChild(link); // <div class="post-image"><a>...</a></div>

            singlePost.append(imgDiv, name, details);

            // Append the complete post to the colDiv
            colDiv.appendChild(singlePost);

            // Append the colDiv to the row container
            foodList.appendChild(colDiv);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

// Call the function to display users when the page loads
window.onload = displayStores;
