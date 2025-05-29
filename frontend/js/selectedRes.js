let userid;

window.onload = function () {
    // check session if logged in to determind button content
    fetch('/api/session')
        .then(response => response.json())
        .then(data => {
            const reserveBtn = document.getElementById('reserveBtn');
            if (!data.loggedIn) {
                reserveBtn.disabled = true;
                reserveBtn.textContent = "Login to Reserve";
                reserveBtn.style.opacity = "0.6";
                reserveBtn.style.cursor = "not-allowed";
            } else {
                userid = data.userId;
            }
        })
        .catch(error => {
            console.error('Error checking session:', error);
        });


    flatpickr("#calender", {
        dateFormat: "Y-m-d",
        minDate: 'today'
    });

    displaySpecificStore();
};

// initialize 0 adults & 0 child
let adultCount = 0;
let childCount = 0;
let stores;

// event listener for when user changes the dropdown
document.getElementById("adultDropdown").addEventListener("change", function () {
    // convert value to int -> if empty then 0
    // 'this' refers to the select tag
    adultCount = parseInt(this.value) || 0;
    changePax();
});

document.getElementById("childDropdown").addEventListener("change", function () {
    childCount = parseInt(this.value) || 0;
    changePax();
});


async function changePax() {
    // to update pax count
    const text = document.getElementById("paxText");
    let totalpax = `${adultCount} Adults`;
    if (childCount > 0) {
        totalpax += `, ${childCount} Children`;
    }
    text.innerHTML = totalpax;
}

async function displayTimingOptions(stores) {

    const timing = document.getElementById('timing-options');
    timing.innerHTML = "";

    // for timing js
    const openTime = stores[0].opening;
    const closeTime = stores[0].closing;

    const label = document.createElement("label");
    label.innerHTML = "Choose a time: ";
    label.className = "d-block mb-2";
    timing.appendChild(label);

    // convert hours to minutes for calculation
    function toMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    let startMin = toMinutes(openTime);
    let closeMin = toMinutes(closeTime);

    // convert startMin (mins) to HH:MM format ( for display time )
    function changeBack(mins) {
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        // formatting hours & mins into HH:MM 
        // converts hours n mins to string 
        // .padStart(2, '0') -> if only 1 digit like 8, then will put 0 in front to become 08
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // visible container to show a few timing options initially
    const visiblePart = document.createElement("div");
    // visiblePart.className = "d-flex flex-wrap mb-2";
    timing.appendChild(visiblePart);

    // hidden part 
    const hiddenPart = document.createElement('div');
    // hiddenPart.className = "d-flex flex-wrap";
    hiddenPart.style.display = 'none';
    timing.appendChild(hiddenPart);

    let count = 0;
    let selectedBtn = null;
    while (startMin < (closeMin - 30)) {
        const btn = document.createElement('button');
        btn.style.width = "70px";
        btn.style.height = "38px";
        btn.textContent = changeBack(startMin);
        btn.className = 'btn btn-outline-primary m-1';
        btn.type = 'button';

        // event listener to track which btn is selected
        btn.addEventListener('click', function () {
            if (selectedBtn) {
                selectedBtn.classList.remove('btn-primary');
                selectedBtn.classList.add('btn-outline-primary');
            }

            // Set new selected button
            selectedBtn = btn;
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-primary');

            const selectedTime = btn.textContent;
            document.getElementById('selectedTimeInput').value = selectedTime;
        })

        if (count < 10) {
            visiblePart.appendChild(btn);
        } else {
            hiddenPart.appendChild(btn);
        }

        startMin += 30;
        count++;
    }

    // if there is timings in hidden part, means need to display " show more "
    if (hiddenPart.children.length > 0) {
        const showmore = document.createElement('button');
        showmore.className = "btn btn-link px-0";
        showmore.textContent = "Show more ▼";
        showmore.type = "button";

        showmore.addEventListener('click', () => {
            const isHidden = hiddenPart.style.display === 'none';
            hiddenPart.style.display = isHidden ? "unset" : "none";
            showmore.textContent = isHidden ? "Show less ▲" : "Show more ▼";
        });
        timing.appendChild(showmore);

    }


}

async function displaySpecificStore() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const name = urlParams.get('name');
        const location = urlParams.get('location');

        const response = await fetch(`/display_specific_store?name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        stores = await response.json();
        displayTimingOptions(stores);
        navTabs(stores);
        reservationForm(stores);

        const storeName = document.getElementById("storeName");
        storeName.innerHTML = stores[0].storeName;

        const cuisine = document.getElementById("cuisine");
        cuisine.innerHTML = stores[0].cuisine;

        const price = document.getElementById("price");
        price.innerHTML = stores[0].priceRange;

        const left = document.getElementById('left-side');
        left.innerHTML = "";

        const link = document.createElement('a');
        link.href = "#";

        const img = document.createElement('img');
        img.style.width = "650px";
        img.style.height = "450px";
        img.style.objectFit = "cover";
        img.src = stores[0].image;
        img.alt = 'Post Image';

        link.appendChild(img);
        left.append(link);

        // const userId = sessionData.loggedIn ? sessionData.userId : null;

        // Set hidden input values
        document.getElementById("reviewUserId").value = userid
        document.getElementById("reviewStoreId").value = stores[0].store_id;

        // Setup review form submission handler
        const reviewForm = document.getElementById("reviewForm");
        reviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await submitReview(userid, stores[0].store_id);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

async function navTabs(stores) {

    // about content
    const title = document.getElementById("aboutTitle");
    title.innerHTML = `About ${stores[0].storeName}`

    const address = document.getElementById("address");
    address.innerHTML = `<i style="color:#FC6C3F" class="bi bi-geo-alt-fill mr-3"></i>${stores[0].address}, Singapore ${stores[0].postalCode}`

    const openinghours = document.getElementById("openinghours");
    openinghours.innerHTML = `<i style="color:#FC6C3F" class="bi bi-clock mr-3"></i>${stores[0].opening.slice(0, 5)} - ${stores[0].closing.slice(0, 5)}`

    // review content
    const reviewContent = document.getElementById("reviewContent");
    const response = await fetch(`/display_reviews?storeid=${stores[0].store_id}`);
    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const reviews = await response.json();
    reviews.forEach(r => {
        // TODO: add who the review is posted by
        const eachReview = document.createElement("div");
        eachReview.style.backgroundColor = "#F9FAFB";
        eachReview.style.boxShadow = "0 2px 2px lightgrey";
        eachReview.style.padding = "10px";
        eachReview.style.marginBottom = "10px";
        eachReview.style.borderRadius = "6px";


        const ratingContent = document.createElement("p");
        ratingContent.innerHTML = `<strong>Rating:</strong> ${r.rating}`;

        const descriptionContent = document.createElement("p");
        descriptionContent.innerHTML = `<strong>Description:</strong> ${r.description}`;

        eachReview.append(ratingContent, descriptionContent);
        reviewContent.append(eachReview);

    });
}

async function reservationForm(stores) {
    const reservationForm = document.getElementById("makeReservationForm");
    reservationForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const pax = document.getElementById("paxText").textContent;
        console.log("pax in form: " + pax);

        const date = document.getElementById('calender').value;
        console.log("date: " + date);

        const time = document.getElementById('selectedTimeInput').value;
        console.log("selected time: " + time);

        const errorMsg = document.getElementById("requiredError");

        if (!time) {
            errorMsg.innerHTML = "Please select a timing.";
            errorMsg.style.color = "red";
        } else {
            // .slice (starting index, ending index)
            const adults = parseInt(pax.slice(0, 1));
            console.log("adults: " + adults);

            const children = parseInt(pax.slice(10, 11));
            console.log("children: " + children);

            const totalpeople = children + adults;

            console.log("Current user: " + userid);

            const storeid = stores[0].store_id;

            const storename = stores[0].storeName;

            // to store reservation data
            sessionStorage.setItem('reservationData', JSON.stringify({
                totalpeople,
                date,
                time,
                storeid,
                storename,
            }));

            window.location.href = '/reserveform';


            // const response = await fetch(`http://localhost:3000/reserve?pax=${totalpeople}&date=${date}&time=${time}&userid=${userid}&storeid=${storeid}`);
            // if (!response.ok) {
            //     throw new Error('Failed to fetch data');
            // }
        }
    })
}


/// To submit a review ////

// document.getElementById("reviewForm").addEventListener("submit", function (e) {
//   e.preventDefault();
//   submitReview(currentStoreId);  // `currentStoreId` should be globally accessible or passed in.
// });


async function submitReview(userId, storeId) {
    const rating = parseFloat(document.getElementById("reviewRating").value);
    const review = document.getElementById("reviewText").value.trim();
    const errorMsg = document.getElementById("reviewError");

    console.log("Submitting review...");
    console.log("User:", userId, "Store:", storeId);
    console.log("Rating:", rating, "Review:", review);

    if (!userId) {
        errorMsg.textContent = "You must be logged in to submit a review.";
        return;
    }

    if (rating < 0.1 || rating > 5.0) {
        errorMsg.textContent = "Rating must be between 0.1 and 5.0.";
        return;
    }

    try {
        const checkRes = await fetch(`/check-reservation?userid=${userId}&storeid=${storeId}`);
        const resData = await checkRes.json();

        if (!resData.hasReserved) {
            errorMsg.textContent = "You must reserve before submitting a review.";
            return;
        }

        const response = await fetch('/add-review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userid: userId,
                storeid: storeId,
                rating,
                review
            })
        });

        const data = await response.json();

        if (response.ok) {
            errorMsg.textContent = "";
            alert("Review submitted!");

            // Success: hide and reset modal
            const modal = bootstrap.Modal.getInstance(document.getElementById("reviewModal"));
            modal.hide();

            document.getElementById("reviewForm").reset();

            location.reload();

        } else {
            errorMsg.textContent = data.error || "Something went wrong.";
        }

    } catch (err) {
        console.error("Error submitting review:", err);
        errorMsg.textContent = "Server error while submitting review.";
    }
}



