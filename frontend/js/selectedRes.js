let userid;
let calenderValue;
let reservationid;
let reserveBtn;
let reservationDetails;
let selectedTime = null;
let selectedPax = 0;

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;

    const htmlMap = {
        '&amp;': '&',
        '&#x2F;': '/',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#039;': "'"
    };

    const decodeOnce = s => s.replace(/(&amp;|&#x2F;|&lt;|&gt;|&quot;|&#039;)/g, m => htmlMap[m]);

    let last = str;
    for (let i = 0; i < 10; i++) {
        const decoded = decodeOnce(last);
        if (decoded === last) break;
        last = decoded;
    }

    return last;
}

function createSecureImageElement(imageUrl, altText, fallbackText = 'Restaurant image') {
    const img = document.createElement('img');
    
    if (!imageUrl || typeof imageUrl !== 'string') {
        img.src = '/static/img/restaurants/no-image.png';
    } else if (imageUrl.startsWith('/static/img/restaurants/')) {
        img.src = imageUrl;
    } else {
        console.warn('Invalid image URL detected:', imageUrl);
        img.src = '/static/img/restaurants/no-image.png';
    }
    
    img.alt = escapeHtml(altText || fallbackText);
    img.referrerPolicy = 'strict-origin-when-cross-origin';
    img.loading = 'lazy';
    
    img.onerror = function() {
        this.src = '/static/img/restaurants/no-image.png';
        this.onerror = null;
    };
    
    return img;
}

function checkReserveButtonState() {
    if (selectedPax > 0 && selectedTime) {
        reserveBtn.disabled = false;
        reserveBtn.classList.remove('btn-disabled');
        reserveBtn.classList.add('btn-primary');
    } else {
        reserveBtn.disabled = true;
        reserveBtn.classList.add('btn-disabled');
        reserveBtn.classList.remove('btn-primary');
    }
}

window.onload = async function () {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        reserveBtn = document.getElementById('reserveBtn');
        if (!data.loggedIn) {
            reserveBtn.disabled = true;
            reserveBtn.textContent = "Login to Reserve";
            reserveBtn.classList.add('btn-disabled');
        } else {
            userid = data.userId;
            // Initially disable until pax and time are selected
            reserveBtn.disabled = true;
            reserveBtn.classList.add('btn-disabled');
        }
    } catch (error) {
        console.error('Error checking session:', error);
    }

    calenderValue = flatpickr("#calender", {
        dateFormat: "Y-m-d",
        minDate: 'today',
        defaultDate: 'today',
    });

    await displaySpecificStore();
};

let adultCount = 0;
let childCount = 0;
let currentcapacity = 0;
let stores;
let pax;
let availCapacity;
let maxcapacity;
let isCapacityExceeded = false;

function validatePaxInput(value, maxValue = 20) {
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed < 0 || parsed > maxValue) {
        return 0;
    }
    return parsed;
}

document.getElementById("adultDropdown").addEventListener("change", function () {
    adultCount = validatePaxInput(this.value);
    changePax();
    handleCapacityUpdate();
    
    const paxError = document.getElementById("paxError");
    if (pax > availCapacity) {
        paxError.textContent = `So sorry, the restaurant only has ${availCapacity} seats left.`;
        paxError.classList.add('error-message');
        paxError.classList.remove('hidden');
        isCapacityExceeded = true;
    } else {
        paxError.classList.add('hidden');
        paxError.classList.remove('error-message');
        isCapacityExceeded = false;
    }
    checkReserveButtonState();
});

document.getElementById("childDropdown").addEventListener("change", function () {
    childCount = validatePaxInput(this.value);
    changePax();
    handleCapacityUpdate();
    
    const paxError = document.getElementById("paxError");
    if (pax > availCapacity) {
        paxError.textContent = `So sorry, the restaurant only has ${availCapacity} seats left.`;
        paxError.classList.add('error-message');
        paxError.classList.remove('hidden');
        isCapacityExceeded = true;
    } else {
        paxError.classList.add('hidden');
        paxError.classList.remove('error-message');
        isCapacityExceeded = false;
    }
    checkReserveButtonState();
});

async function changePax() {
    const text = document.getElementById("paxText");
    let totalpax = `${adultCount} Adults, ${childCount} Children`;
    text.textContent = totalpax;
    selectedPax = adultCount + childCount;
}

async function displayTimingOptions() {
    const timing = document.getElementById('timing-options');
    timing.textContent = "";

    const openTime = stores[0].opening;
    const closeTime = stores[0].closing;

    const label = document.createElement("label");
    label.textContent = "Choose a time: ";
    label.className = "d-block mb-2";
    timing.appendChild(label);

    // Create a single container for all timing buttons
    const timingGrid = document.createElement("div");
    timingGrid.className = "timing-grid";
    timing.appendChild(timingGrid);

    const visiblePart = document.createElement("div");
    visiblePart.className = "timing-visible";
    timingGrid.appendChild(visiblePart);

    const hiddenPart = document.createElement('div');
    hiddenPart.className = "timing-hidden hidden";
    timingGrid.appendChild(hiddenPart);

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

        visiblePart.textContent = '';
        hiddenPart.textContent = '';
        hiddenPart.classList.add('hidden');

        const oldShowMore = document.getElementById('showMoreBtn');
        if (oldShowMore) oldShowMore.remove();

        let startMin = toMinutes(openTime);
        let closeMin = toMinutes(closeTime);

        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(selectedDate)) {
            console.error('Invalid date format:', selectedDate);
            return;
        }

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

        while (startMin < (closeMin - 30)) {
            paxPerHour = 0;

            const btn = document.createElement('button');
            btn.classList.add('timing-btn', 'm-1');
            btn.textContent = changeBack(startMin);
            btn.type = 'button';
            btn.classList.add("timingButtons");

            if (btn.textContent <= currentTime && selectedDate === currentdate) {
                btn.disabled = true;
                btn.classList.add("btn-outline-secondary")
            }

            if (btn.disabled) {
                btn.classList.add('btn-outline-secondary');
            } else {
                btn.classList.add('btn-timing-available');
            }

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
                    btn.classList.remove('btn-timing-available');
                    btn.classList.add("btn-outline-secondary");
                }

                console.log("available capacity: " + availCapacity);
            }

            btn.addEventListener('click', function () {
                if (selectedBtn) {
                    selectedBtn.classList.remove('btn-timing-selected');
                    selectedBtn.classList.add('btn-timing-available');
                }

                selectedBtn = btn;
                btn.classList.remove('btn-outline-primary', 'btn-timing-available');
                btn.classList.add('btn-timing-selected');

                selectedTime = btn.textContent;
                document.getElementById('selectedTimeInput').value = selectedTime;

                console.log("pax per hour: " + paxHour);
                availCapacity = maxcapacity[0].totalCapacity - paxHour;
                const paxError = document.getElementById("paxError");
                console.log("available capacity: " + availCapacity);
                console.log("is pax > capacity: " + (pax > availCapacity));
                
                if (pax > availCapacity) {
                    paxError.textContent = `So sorry, the restaurant only has ${availCapacity} seats left.`;
                    paxError.classList.add('error-message');
                    paxError.classList.remove('hidden');
                    isCapacityExceeded = true;
                } else {
                    paxError.classList.add('hidden');
                    paxError.classList.remove('error-message');
                    isCapacityExceeded = false;
                }
                
                checkReserveButtonState();
            });

            if (count < 10) {
                visiblePart.appendChild(btn);
            } else {
                hiddenPart.appendChild(btn);
            }

            startMin += 30;
            count++;
        }

        if (hiddenPart.children.length > 0) {
            const showmore = document.createElement('button');
            showmore.className = "btn btn-link px-0 text-primary";
            showmore.textContent = "Show less ▲";
            showmore.type = "button";
            showmore.id = 'showMoreBtn';

            showmore.addEventListener('click', () => {
                const isHidden = hiddenPart.classList.contains('hidden');
                if (isHidden) {
                    hiddenPart.classList.remove('hidden');
                    showmore.textContent = "Show less ▲";
                } else {
                    hiddenPart.classList.add('hidden');
                    showmore.textContent = "Show more ▼";
                }
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
        selectedTime = null; // Reset selected time when date changes
        checkReserveButtonState();
        handleDisable();
    });
}

async function handleCapacityUpdate() {
    pax = adultCount + childCount;
    console.log("selected pax: " + pax);
}

async function loadFields(reservationid, timingButton) {
    console.log(reservationDetails);
    document.getElementById("adultDropdown").value = reservationDetails[0].adultPax;
    document.getElementById("childDropdown").value = reservationDetails[0].childPax;
    adultCount = reservationDetails[0].adultPax;
    childCount = reservationDetails[0].childPax;
    selectedPax = adultCount + childCount;
    changePax();
    calenderValue.setDate(reservationDetails[0].reservationDate, true);
    const reservationTime = reservationDetails[0].reservationTime.slice(0, 5);
    console.log(reservationTime);

    timingButton.forEach((btn) => {
        if (btn.textContent == reservationTime) {
            selectedTime = btn.textContent;
            document.getElementById('selectedTimeInput').value = btn.textContent;
            btn.id = "reservationTime";
            btn.classList.add('btn-reservation-time');
            btn.disabled = true;
        }
    });

    document.getElementById("reserveBtn").textContent = "Update Reservation";
    checkReserveButtonState();
}

async function displaySpecificStore() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const name = urlParams.get('name');
        const location = urlParams.get('location');

        if (!name || !location) {
            throw new Error('Missing required parameters');
        }

        const response = await fetch(`/display_specific_store?name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        stores = await response.json();
        document.title = `${escapeHtml(stores[0].storeName)} - ${escapeHtml(stores[0].location)}`;
        await displayTimingOptions();

        navTabs(stores);
        await reservationForm(stores);

        currentcapacity = stores[0].currentCapacity;

        const storeName = document.getElementById("storeName");
        storeName.textContent = stores[0].storeName;

        const cuisine = document.getElementById("cuisine");
        cuisine.textContent = stores[0].cuisine;

        const price = document.getElementById("price");
        price.textContent = stores[0].priceRange;

        const left = document.getElementById('left-side');
        left.textContent = "";

        const link = document.createElement('a');
        link.href = "#";

        const img = createSecureImageElement(
            stores[0].imageUrl,
            stores[0].altText || `${stores[0].storeName} restaurant image`,
            'Restaurant image'
        );
        
        img.classList.add('restaurant-main-image');

        link.appendChild(img);
        left.append(link);

        document.getElementById("reviewUserId").value = userid;
        document.getElementById("reviewStoreId").value = stores[0].store_id;

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
    const title = document.getElementById("aboutTitle");
    title.textContent = `About ${stores[0].storeName}`;

    const address = document.getElementById("address");
    const addressIcon = document.createElement('i');
    addressIcon.className = 'bi bi-geo-alt-fill mr-3 text-primary';
    const addressText = document.createTextNode(` ${stores[0].address}, Singapore ${stores[0].postalCode}`);
    address.textContent = '';
    address.appendChild(addressIcon);
    address.appendChild(addressText);

    const openinghours = document.getElementById("openinghours");
    const hoursIcon = document.createElement('i');
    hoursIcon.className = 'bi bi-clock mr-3 text-primary';
    const hoursText = document.createTextNode(` ${stores[0].opening.slice(0, 5)} - ${stores[0].closing.slice(0, 5)}`);
    openinghours.textContent = '';
    openinghours.appendChild(hoursIcon);
    openinghours.appendChild(hoursText);

    const reviewContent = document.getElementById("reviewContent");
    const response = await fetch(`/display_reviews?storeid=${encodeURIComponent(stores[0].store_id)}`);
    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const reviews = await response.json();
    reviewContent.textContent = '';

    reviews.forEach(r => {
        const eachReview = document.createElement("div");
        eachReview.classList.add('review-card');

        const ratingContent = document.createElement("p");
        ratingContent.textContent = `Rating: ${r.rating}`;

        const descriptionContent = document.createElement("p");
        descriptionContent.textContent = `Description: ${decodeHtmlEntities(r.description)}`;

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
            paxError.textContent = "Pax cannot be 0!";
            paxError.classList.add('error-message');
            paxError.classList.remove('hidden');
        } else if (isCapacityExceeded) {
            // Error already shown
        } else if (!time) {
            errorMsg.textContent = "Please select a timing.";
            errorMsg.classList.add('error-message');
            errorMsg.classList.remove('hidden');
        } else {
            const totalpeople = childCount + adultCount;
            console.log("totalpax: " + totalpeople);
            console.log("Current user: " + userid);

            const storeid = stores[0].store_id;
            const storename = stores[0].storeName;

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
        paxError.textContent = "No seats available.";
        paxError.classList.add('error-message');
        paxError.classList.remove('hidden');
        return false;
    } else {
        paxError.textContent = "";
        paxError.classList.add('hidden');
        paxError.classList.remove('error-message');
        return true;
    }
}

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

function showErrorMessage(message) {
    const container = document.querySelector('.container') || document.body;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger error-toast';
    errorDiv.textContent = message;
    
    container.appendChild(errorDiv);
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

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