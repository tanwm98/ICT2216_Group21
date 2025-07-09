let userid;

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// FIXED: Use the simple, comprehensive decoding function
function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;

    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

function closePopup() {
    const modal = document.getElementById('popupModal');
    modal.classList.add('hidden');
    window.location.href = '/';
}

function showError(message) {
    const errorMsg = document.getElementById('reserveError');
    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
        errorMsg.classList.add('error-message');
    }
}

function hideError() {
    const errorMsg = document.getElementById('reserveError');
    if (errorMsg) {
        errorMsg.classList.add('hidden');
        errorMsg.classList.remove('error-message');
    }
}

function showSuccessPopup(message) {
    document.getElementById('popupMessage').textContent = message;
    document.querySelector('.popup-icon').textContent = "✅";
    const modal = document.getElementById('popupModal');
    modal.classList.remove('hidden');
    modal.classList.add('popup-show');
}

window.onload = async function () {
    const data = JSON.parse(sessionStorage.getItem('reservationData'));
    console.log(data);

    const totalpeople = data.totalpeople;
    const date = data.date;
    const time = data.time;
    const storeid = data.storeid;
    const storename = data.storename;
    const adultpax = data.adultCount;
    const childpax = data.childCount;

    // get reservation id from query param
    const urlParams = new URLSearchParams(window.location.search);
    const reservationid = urlParams.get("rid");
    console.log(reservationid);

    try {
        const response = await fetch('/api/session');
        const sessionData = await response.json();

        if (!sessionData.loggedIn) {
            window.location.href = './login';
        } else {
            userid = sessionData.userId;
            if (reservationid) {
                await populateFields(reservationid);
            }
            await makeReservation(totalpeople, date, time, userid, storeid, storename, adultpax, childpax, reservationid);
        }
    } catch (error) {
        console.error('Error checking session:', error);
    }
};

// FIXED: Properly decode and handle special requests
async function populateFields(reservationid) {
    console.log("running populateField");
    try {
        const response = await fetch(`/get_reservation_by_id?reservationid=${encodeURIComponent(reservationid)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }
        const reservationDetails = await response.json();
        const details = reservationDetails[0];

        console.log("[DEBUG] Raw special request from backend:", details.specialRequest);

        // FIXED: Decode first, then safely display
        const decodedFirstName = decodeHtmlEntities(details.first_name || '');
        const decodedLastName = decodeHtmlEntities(details.last_name || '');
        const decodedSpecialRequest = decodeHtmlEntities(details.specialRequest || '');

        console.log("[DEBUG] Decoded special request:", decodedSpecialRequest);

        // Use decoded values in form fields (form fields handle text safely)
        document.getElementById('firstname').value = decodedFirstName;
        document.getElementById('lastname').value = decodedLastName;
        document.getElementById('specialrequest').value = decodedSpecialRequest;

    } catch (error) {
        console.error('Error populating fields:', error);
        showError('Failed to load reservation details');
    }
}

// FIXED: Decode store name for display
async function makeReservation(totalpeople, date, time, userid, storeid, storename, adultpax, childpax, reservationid) {
    try {
        // FIXED: Decode store name before displaying
        const decodedStoreName = decodeHtmlEntities(storename);

        // Set reservation details with decoded content (textContent is safe)
        document.getElementById("storename").textContent = decodedStoreName;
        document.getElementById("totalpax").textContent = `👤 ${totalpeople}`;
        document.getElementById("date").textContent = `📅 ${date}`;
        document.getElementById("time").textContent = `🕑 ${time}`;

        // load first name and last name with db values
        const response = await fetch(`/get_name?userid=${encodeURIComponent(userid)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }
        const name = await response.json();
        console.log(name);

        // FIXED: Decode user names before populating (only if not already populated)
        if (!document.getElementById('firstname').value) {
            const decodedFirstName = decodeHtmlEntities(name[0].firstname || '');
            const decodedLastName = decodeHtmlEntities(name[0].lastname || '');

            document.getElementById('firstname').value = decodedFirstName;
            document.getElementById('lastname').value = decodedLastName;
        }

        const form = document.getElementById("completeReservation");
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideError(); // Clear any previous errors

            const firstname = document.getElementById('firstname').value.trim();
            const lastname = document.getElementById('lastname').value.trim();
            const specialrequest = document.getElementById('specialrequest').value.trim();

            // Validate inputs
            if (!firstname || !lastname) {
                showError('First name and last name are required');
                return;
            }

            if (firstname.length > 100 || lastname.length > 100) {
                showError('Names must be less than 100 characters');
                return;
            }

            if (specialrequest.length > 500) {
                showError('Special request must be less than 500 characters');
                return;
            }

            console.log("firstname: " + firstname);
            console.log("lastname: " + lastname);
            console.log("specialrequest: " + specialrequest);

            let response;

            try {
                if (reservationid) {
                    console.log('updating reservation');
                    response = await window.csrfFetch('/update_reservation', {
                        method: 'POST',
                        body: JSON.stringify({
                            pax: totalpeople,
                            adultpax,
                            childpax,
                            date,
                            time,
                            userid,
                            firstname,
                            lastname,
                            specialrequest,
                            storename: decodedStoreName, // Send decoded store name
                            reservationid
                        })
                    });
                } else {
                    response = await window.csrfFetch('/reserve', {
                        method: 'POST',
                        body: JSON.stringify({
                            pax: totalpeople,
                            date,
                            time,
                            userid,
                            storeid,
                            firstname,
                            lastname,
                            specialrequest,
                            storename: decodedStoreName, // Send decoded store name
                            adultpax,
                            childpax
                        })
                    });
                }

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Reservation failed');
                } else {
                    // reservation successful
                    const successMessage = reservationid ? 
                        "Reservation updated successfully!" : 
                        "Reservation completed successfully!";
                    showSuccessPopup(successMessage);
                }

            } catch (error) {
                console.error('Reservation error:', error);
                showError(error.message || 'An error occurred while processing your reservation');
            }
        });

    } catch (err) {
        console.error('Error making reservation:', err);
        showError('Failed to load reservation form');
    }
}

// Setup popup close button event listener when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const okButton = document.querySelector('.popup-ok-btn');
    if (okButton) {
        okButton.addEventListener('click', closePopup);
    }
});