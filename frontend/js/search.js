// async function displayStores() {
//     try {
//         const response = await fetch('http://localhost:3000/displayStores'); // Fetch data from Express API
//         if (!response.ok) {
//             throw new Error('Failed to fetch data');
//         }

//         const stores = await response.json();  // Parse the JSON response

//         const foodList = document.getElementById('res-content');
//         foodList.innerHTML = "";

//         stores.forEach(store => {


//             // inner wrapper div to hold store info
//             const singlePost = document.createElement('div');
//             singlePost.classList.add('restaurant-card');

//             // image div 
//             const imgDiv = document.createElement('img');
//             img.src = store.image;
//             img.alt = store.storeName;
//             img.style.width = "120px";
//             img.style.height = "100px";
//             img.style.objectFit = "cover";
//             img.alt = 'Store Image';
//             card.appendChild(img);

//             // creating <a> tag for image
//             //const link = document.createElement('a');
//             // set store name as parameter for page to show store details
//             // link.href = `selectedRes.html?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;

//             // creating img tag inside img div
//             // const img = document.createElement('img');
//             // img.style.width = "120px";
//             // img.style.height = "100px";
//             // img.style.objectFit = "cover";
//             // img.src = store.image;
//             // img.alt = 'Store Image';

//             // creating div tag for store name
//             // const name = document.createElement('a');
//             // name.href = `selectedRes.html?name=${encodeURIComponent(store.storeName)}&location=${encodeURIComponent(store.location)}`;
//             // const nameHeader = document.createElement('h4'); // <a> <h4> </h4> </a> 
//             // nameHeader.innerHTML = store.storeName;
//             // name.appendChild(nameHeader);

//             // div tag for cuisine, location, price and rating
//             const details = document.createElement('div');
//             // add styling for details div 
//             details.classList.add('restaurant-info');

//             const name = document.createElement('h4');
//             name.innerText = store.storeName;
//             infoDiv.appendChild(name);

//             const location = document.createElement('p');
//             location.innerText = store.location;
//             infoDiv.appendChild(location);

//             const cuisine = document.createElement('p');
//             cuisine.innerText = store.cuisine;
//             infoDiv.appendChild(cuisine);

//             const price = document.createElement('p');
//             price.innerText = "Price " + store.priceRange;
//             infoDiv.appendChild(price);

//             card.appendChild(infoDiv);

//              // Rating Section
//             const ratingDiv = document.createElement('div');
//             ratingDiv.classList.add('rating');
//             ratingDiv.innerHTML = `${store.rating}<br/><small>${store.reviewCount} reviews</small>`;
//             card.appendChild(ratingDiv);

//             // Append card to container
//             foodList.appendChild(card);

//             // // append can multiple , appendChild only 1
//             // detailsChild.append(cuisine, location, priceRange);
//             // ratingDiv.appendChild(rating);
//             // details.append(detailsChild, rating); // add the details into the parent div


//             // link.appendChild(img); // <a><img></a>
//             // imgDiv.appendChild(link); // <div class="post-image"><a>...</a></div>

//             // singlePost.append(imgDiv, name, details);

//             // // Append the complete post to the colDiv
//             // colDiv.appendChild(singlePost);

//             // // Append the colDiv to the row container
//             // foodList.appendChild(colDiv);
//         });

//     } catch (error) {
//         console.error('Error:', error);
//     }
// }

// // Call the function to display users when the page loads
// window.onload = displayStores;

async function displayStores() {
    try {
        const response = await fetch('http://localhost:3000/displayStores');
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

window.onload = displayStores;
