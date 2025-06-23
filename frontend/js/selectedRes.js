let userid;
let calenderValue;
let reservationid;
let reserveBtn;
let reservationDetails;

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// SECURITY: Create secure image element
function createSecureImageElement(imageUrl, altText, fallbackText = 'Restaurant image') {
    const img = document.createElement('img');
    
    // SECURITY: Validate image URL format
    if (!imageUrl || typeof imageUrl !== 'string') {
        img.src = '/static/img/restaurants/no-image.png';
    } else if (imageUrl.startsWith('/static/img/restaurants/')) {
        img.src = imageUrl;
    } else {
        console.warn('Invalid image URL detected:', imageUrl);
        img.src = '/static/img/restaurants/no-image.png';
    }
    
    // SECURITY: Escape alt text to prevent XSS
    img.alt = escapeHtml(altText || fallbackText);
    
    // SECURITY: Add security attributes
    img.referrerPolicy = 'strict-origin-when-cross-origin';
    img.loading = 'lazy';
    
    // Error handling for missing images
    img.onerror = function() {
        this.src = '/static/img/restaurants/no-image.png';
        this.onerror = null; // Prevent infinite loop
    };
    
    return img;
}

window.onload = async function () {
    // check session if logged in to determine button content
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        reserveBtn = document.getElementById('reserveBtn');
        if (!data.loggedIn) {
            reserveBtn.disabled = true;
            reserveBtn.textContent = "Login to Reserve";
            reserveBtn.style.opacity = "0.6";
            reserveBtn.style.cursor = "not-allowed";
        } else {
            userid = data.userId;
        }
    } catch (error) {
        console.error('Error checking session:', error);
    }

    calenderValue = flatpickr("#calender", {
        dateFormat: "Y-m-d",
        minDate: 'today',
        defaultDate: 'today',
    });

    // wait until store and timing buttons are loaded
    await displaySpecificStore();
};

// initialize 0 adults & 0 child
let adultCount = 0;
let childCount = 0;
let currentcapacity = 0;
let stores;
let pax;
let availCapacity;
let maxcapacity;

// a boolean tracker to track whether the selected pax exceeds current capacity
let isCapacityExceeded = false;

// SECURITY: Input validation for dropdowns
function validatePaxInput(value, maxValue = 20) {
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed < 0 || parsed > maxValue) {
        return 0;
    }
    return parsed;
}

// event listener for when user changes the dropdown
document.getElementById("adultDropdown").addEventListener("change", function () {
    // SECURITY: Validate input
    adultCount = validatePaxInput(this.value);
    changePax();
    handleCapacityUpdate();
    
    const paxError = document.getElementById("paxError");
    if (pax > availCapacity) {
        paxError.innerHTML = escapeHtml(`So sorry, the restaurant only has ${availCapacity} seats left.`);
        paxError.style.color = "red";
        paxError.style.display = "unset";
        isCapacityExceeded = true;
        // to disable button
        reserveBtn.disabled = true;
        reserveBtn.style.cursor = "not-allowed";
    } else {
        paxError.style.display = "none";
        isCapacityExceeded = false;
        reserveBtn.disabled = false;
        reserveBtn.style.backgroundColor = "#fc6c3f";
    }
});

document.getElementById("childDropdown").addEventListener("change", function () {
    // SECURITY: Validate input
    childCount = validatePaxInput(this.value);
    changePax();
    handleCapacityUpdate();
    
    const paxError = document.getElementById("paxError");
    if (pax > availCapacity) {
        paxError.innerHTML = escapeHtml(`So sorry, the restaurant only has ${availCapacity} seats left.`);
        paxError.style.color = "red";
        paxError.style.display = "unset";
        isCapacityExceeded = true;
        // to disable button
        reserveBtn.disabled = true;
        reserveBtn.style.cursor = "not-allowed";
    } else {
        paxError.style.display = "none";
        isCapacityExceeded = false;
        reserveBtn.disabled = false;
        reserveBtn.style.backgroundColor = "#fc6c3f";
    }
});

async function changePax() {
    // to update pax count
    const text = document.getElementById("paxText");
    let totalpax = `${adultCount} Adults, ${childCount} Children`;
    
    // SECURITY: Use textContent to prevent XSS
    text.textContent = totalpax;
}

async function displayTimingOptions() {
    const timing = document.getElementById('timing-options');
    timing.innerHTML = "";

    // for timing js
    const openTime = stores[0].opening;
    const closeTime = stores[0].closing;

    const label = document.createElement("label");
    label.textContent = "Choose a time: "; // SECURITY: Use textContent
    label.className = "d-block mb-2";
    timing.appendChild(label);

    // visible container to show a few timing options initially
    const visiblePart = document.createElement("div");
    visiblePart.id = "visiblePart";
    timing.appendChild(visiblePart);

    // hidden part 
    const hiddenPart = document.createElement('div');
    hiddenPart.id = "hiddenPart";
    hiddenPart.style.display = 'none';
    timing.appendChild(hiddenPart);

    // if timing past & same date, then disable -> to prevent it from disabling timings from other dates
    const date = document.getElementById('calender');
    const today = new Date();
    const currentdate = today.toISOString().split('T')[0];

    let selectedBtn = null;

    const urlParams = new URLSearchParams(window.location.search);
    reservationid = urlParams.get("reservationid");

    let dateChanged = false;
    let selectedDate;

    if (reservationid) {
        const response = await fetch(`/get_reservation_by_id?reservationid=${encodeURIComponent(reservationid)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }
        reservationDetails = await response.json();
        console.log(reservationDetails[0]);
        const reservationdate = reservationDetails[0].reservationDate;
        selectedDate = reservationdate;
    } else {
        selectedDate = date.value;
    }

    async function handleDisable() {
        console.log("running disable");
        let paxPerHour = 0;

        // Clear existing buttons on each regeneration
        visiblePart.innerHTML = '';
        hiddenPart.innerHTML = '';

        // whenever change date, it will hide the excess timings and do show more
        hiddenPart.style.display = 'none';

        // need to clear the show more cuz it will keep adding everytime change date
        const oldShowMore = document.getElementById('showMoreBtn');
        if (oldShowMore) oldShowMore.remove();

        let startMin = toMinutes(openTime);
        let closeMin = toMinutes(closeTime);

        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        // SECURITY: Validate date format before API call
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(selectedDate)) {
            console.error('Invalid date format:', selectedDate);
            return;
        }

        // query reservations at selected date
        const response = await fetch(`/timeslots?date=${encodeURIComponent(selectedDate)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }
        const result = await response.json();

        const maxcapresponse = await fetch(`/maxcapacity?storeid=${encodeURIComponent(stores[0].store_id)}`);
        if (!maxcapresponse.ok) {
            throw new Error('Failed to fetch data');
        }
        maxcapacity = await maxcapresponse.json();

        let count = 0;

        // create timer options
        while (startMin < (closeMin - 30)) {
            // reset to 0 for each time slot
            paxPerHour = 0;

            const btn = document.createElement('button');
            btn.style.width = "70px";
            btn.style.height = "38px";
            btn.textContent = changeBack(startMin);
            btn.className = 'btn m-1';
            btn.type = 'button';
            btn.classList.add("timingButtons");

            // disable button if date is today & time already passed
            if (btn.textContent <= currentTime && selectedDate === currentdate) {
                btn.disabled = true;
                btn.classList.add("btn-outline-secondary")
            }

            if (btn.disabled) {
                btn.classList.add('btn-outline-secondary');
            } else {
                btn.style.border = '1px solid #fc6c3f';
                btn.style.color = '#fc6c3f';
            }

            // reservation timing
            const slotTime = changeBack(startMin);
            const slotEnd = new Date(`${selectedDate}T${slotTime}:00`);
            const slotStart = new Date(slotEnd.getTime() - 60 * 60 * 1000);
            
            const formattedSlotEnd = formatTime(slotEnd);
            const formattedSlotStart = formatTime(slotStart);
            
            console.log("selectedDate: " + selectedDate);
            console.log("end: " + formattedSlotEnd);
            console.log("start: " + formattedSlotStart);
            
            let paxHour;

            if (count > 0) {
                for (const r of result) {
                    if (r.reservationTime >= formattedSlotStart && r.reservationTime <= formattedSlotEnd) {
                        console.log("reservation timing: " + r.reservationTime);
                        console.log("no of pax: " + r.noOfGuest);
                        paxPerHour += r.noOfGuest;
                        console.log("pax per hour: " + paxPerHour);
                    }
                }
                paxHour = paxPerHour;
                availCapacity = maxcapacity[0].totalCapacity - paxHour;

                if (availCapacity == 0) {
                    btn.disabled = true;
                    btn.style.border = "";
                    btn.style.color = "";
                    btn.classList.add("btn-outline-secondary");
                }

                console.log("available capacity: " + availCapacity);
            }

            // event listener to track which btn is selected
            btn.addEventListener('click', function () {
                if (selectedBtn) {
                    // reset style of previously selected button
                    selectedBtn.style.border = '1px solid #fc6c3f';
                    selectedBtn.style.backgroundColor = 'white';
                    selectedBtn.style.color = '#fc6c3f';
                }

                // Set selected as newly selected btn
                selectedBtn = btn;
                btn.classList.remove('btn-outline-primary');
                btn.style.backgroundColor = "#fc6c3f";
                btn.style.color = "white";

                const selectedTime = btn.textContent;
                document.getElementById('selectedTimeInput').value = selectedTime;

                console.log("pax per hour: " + paxHour);
                availCapacity = maxcapacity[0].totalCapacity - paxHour;
                const paxError = document.getElementById("paxError");
                console.log("available capacity: " + availCapacity);
                console.log("is pax > capacity: " + (pax > availCapacity));
                
                if (pax > availCapacity) {
                    paxError.innerHTML = escapeHtml(`So sorry, the restaurant only has ${availCapacity} seats left.`);
                    paxError.style.color = "red";
                    paxError.style.display = "unset";
                    isCapacityExceeded = true;
                    reserveBtn.disabled = true;
                    reserveBtn.style.cursor = "not-allowed";
                } else {
                    paxError.style.display = "none";
                    isCapacityExceeded = false;
                    reserveBtn.disabled = false;
                    reserveBtn.style.backgroundColor = "#fc6c3f";
                }
            });

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
            showmore.className = "btn btn-link px-0 text-primary";
            showmore.textContent = "Show more ▼";
            showmore.type = "button";
            showmore.id = 'showMoreBtn';

            showmore.addEventListener('click', () => {
                const isHidden = hiddenPart.style.display === 'none';
                hiddenPart.style.display = isHidden ? "unset" : "none";
                showmore.textContent = isHidden ? "Show less ▲" : "Show more ▼";
            });
            timing.appendChild(showmore);
        }
    }

    await handleDisable();

    if (reservationid) {
        const timingButton = document.querySelectorAll('button.timingButtons');
        await loadFields(reservationid, timingButton);
    }

    date.addEventListener("change", () => {
        dateChanged = true;
        selectedDate = date.value;
        handleDisable();
    });
}

async function handleCapacityUpdate() {
    pax = adultCount + childCount;
    console.log("selected pax: " + pax);
}

// edit reservation
async function loadFields(reservationid, timingButton) {
    console.log(reservationDetails);
    document.getElementById("adultDropdown").value = reservationDetails[0].adultPax;
    document.getElementById("childDropdown").value = reservationDetails[0].childPax;
    adultCount = reservationDetails[0].adultPax;
    childCount = reservationDetails[0].childPax;
    changePax();
    calenderValue.setDate(reservationDetails[0].reservationDate, true);
    const reservationTime = reservationDetails[0].reservationTime.slice(0, 5); // "09:00"
    console.log(reservationTime);

    timingButton.forEach((btn) => {
        if (btn.textContent == reservationTime) {
            document.getElementById('selectedTimeInput').value = btn.textContent;
            btn.id = "reservationTime";
            btn.style.border = '1px solid #fc3f3f';
            btn.style.backgroundColor = '#fc3f3f';
            btn.style.color = 'white';
            btn.disabled = true;
        }
    });

    document.getElementById("reserveBtn").textContent = "Update Reservation"; // SECURITY: Use textContent
}

// FIXED: Display specific store with secure image handling
async function displaySpecificStore() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const name = urlParams.get('name');
        const location = urlParams.get('location');

        // SECURITY: Validate URL parameters
        if (!name || !location) {
            throw new Error('Missing required parameters');
        }

        const response = await fetch(`/display_specific_store?name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        stores = await response.json();
        await displayTimingOptions();

        navTabs(stores);
        await reservationForm(stores);

        currentcapacity = stores[0].currentCapacity;

        // SECURITY: Use textContent for user-controlled data
        const storeName = document.getElementById("storeName");
        storeName.textContent = stores[0].storeName;

        const cuisine = document.getElementById("cuisine");
        cuisine.textContent = stores[0].cuisine;

        const price = document.getElementById("price");
        price.textContent = stores[0].priceRange;

        const left = document.getElementById('left-side');
        left.innerHTML = "";

        const link = document.createElement('a');
        link.href = "#";

        // FIXED: Use secure image URL instead of base64
        const img = createSecureImageElement(
            stores[0].imageUrl, // FIXED: Use imageUrl instead of base64
            stores[0].altText || `${stores[0].storeName} restaurant image`,
            'Restaurant image'
        );
        
        // Set image styling
        img.style.width = "650px";
        img.style.height = "450px";
        img.style.objectFit = "cover";

        link.appendChild(img);
        left.append(link);

        // Set hidden input values
        document.getElementById("reviewUserId").value = userid;
        document.getElementById("reviewStoreId").value = stores[0].store_id;

        // Setup review form submission handler
        const reviewForm = document.getElementById("reviewForm");
        reviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await submitReview(userid, stores[0].store_id);
        });

    } catch (error) {
        console.error('Error:', error);
        showErrorMessage('Failed to load restaurant details. Please try again.');
    }
}

async function navTabs(stores) {
    // about content
    const title = document.getElementById("aboutTitle");
    title.textContent = `About ${stores[0].storeName}`; // SECURITY: Use textContent

    const address = document.getElementById("address");
    // SECURITY: Escape user data in innerHTML
    address.innerHTML = `<i style="color:#FC6C3F" class="bi bi-geo-alt-fill mr-3"></i> ${escapeHtml(stores[0].address)}, Singapore ${escapeHtml(stores[0].postalCode)}`;

    const openinghours = document.getElementById("openinghours");
    openinghours.innerHTML = `<i style="color:#FC6C3F" class="bi bi-clock mr-3"></i> ${escapeHtml(stores[0].opening.slice(0, 5))} - ${escapeHtml(stores[0].closing.slice(0, 5))}`;

    // review content
    const reviewContent = document.getElementById("reviewContent");
    const response = await fetch(`/display_reviews?storeid=${encodeURIComponent(stores[0].store_id)}`);
    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const reviews = await response.json();
    reviews.forEach(r => {
        const eachReview = document.createElement("div");
        eachReview.style.backgroundColor = "#F9FAFB";
        eachReview.style.boxShadow = "0 2px 2px lightgrey";
        eachReview.style.padding = "10px";
        eachReview.style.marginBottom = "10px";
        eachReview.style.borderRadius = "6px";

        const ratingContent = document.createElement("p");
        // SECURITY: Escape user content
        ratingContent.innerHTML = `<strong>Rating:</strong> ${escapeHtml(r.rating.toString())}`;

        const descriptionContent = document.createElement("p");
        descriptionContent.innerHTML = `<strong>Description:</strong> ${escapeHtml(r.description)}`;

        eachReview.append(ratingContent, descriptionContent);
        reviewContent.append(eachReview);
    });
}

async function reservationForm(stores) {
    const reservationForm = document.getElementById("makeReservationForm");

    reservationForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const paxError = document.getElementById("paxError");
        const pax = document.getElementById("paxText").textContent;
        console.log("pax in form: " + pax);

        const date = document.getElementById('calender').value;
        console.log("date: " + date);

        const time = document.getElementById('selectedTimeInput').value;
        console.log("selected time: " + time);

        const errorMsg = document.getElementById("requiredError");

        if (adultCount == 0 && childCount == 0) {
            paxError.textContent = "Pax cannot be 0!"; // SECURITY: Use textContent
            paxError.style.color = "red";
            paxError.style.display = "unset";
        } else if (isCapacityExceeded) {
            // Error already shown
        } else if (!time) {
            errorMsg.textContent = "Please select a timing."; // SECURITY: Use textContent
            errorMsg.style.color = "red";
            errorMsg.style.display = "unset";
        } else {
            const totalpeople = childCount + adultCount;
            console.log("totalpax: " + totalpeople);
            console.log("Current user: " + userid);

            const storeid = stores[0].store_id;
            const storename = stores[0].storeName;

            // SECURITY: Store reservation data securely (consider using JWT instead of sessionStorage for sensitive data)
            sessionStorage.setItem('reservationData', JSON.stringify({
                totalpeople,
                date,
                time,
                storeid,
                storename,
                adultCount,
                childCount
            }));

            if (reservationid) {
                window.location.href = `/reserveform?rid=${encodeURIComponent(reservationid)}`;
            } else {
                window.location.href = `/reserveform`;
            }
        }
    });
}

async function validateCapacity() {
    const paxError = document.getElementById("paxError");

    if (pax > currentcapacity) {
        paxError.textContent = "No seats available."; // SECURITY: Use textContent
        paxError.style.color = "red";
        paxError.style.display = "unset";
        return false;
    } else {
        paxError.textContent = "";
        paxError.style.display = "none";
        return true;
    }
}

// SECURITY: Enhanced review submission with input validation
async function submitReview(userId, storeId) {
    const rating = parseFloat(document.getElementById("reviewRating").value);
    const review = document.getElementById("reviewText").value.trim();
    const errorMsg = document.getElementById("reviewError");

    console.log("Submitting review...");
    console.log("User:", userId, "Store:", storeId);
    console.log("Rating:", rating, "Review:", review);

    // SECURITY: Validate inputs
    if (!userId) {
        errorMsg.textContent = "You must be logged in to submit a review.";
        return;
    }

    if (isNaN(rating) || rating < 0.1 || rating > 5.0) {
        errorMsg.textContent = "Rating must be between 0.1 and 5.0.";
        return;
    }

    if (!review || review.length < 5 || review.length > 500) {
        errorMsg.textContent = "Review must be between 5 and 500 characters.";
        return;
    }

    try {
        const checkRes = await fetch(`/check-reservation?userid=${encodeURIComponent(userId)}&storeid=${encodeURIComponent(storeId)}`);
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

// SECURITY: Show user-friendly error messages
function showErrorMessage(message) {
    const container = document.querySelector('.container') || document.body;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '20px';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.zIndex = '9999';
    errorDiv.textContent = message;
    
    container.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// Helper functions (unchanged)
function toMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function changeBack(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

const formatTime = (date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};