

let userid;

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
    reservationid = urlParams.get("rid");
    console.log(reservationid);

    try {
        const response = await fetch('/api/session');
        const data = await response.json();

        if (!data.loggedIn) {
            window.location.href = './login';
        } else {
            userid = data.userId;
            if (reservationid) {
                await populateFields(reservationid);
            }
            await makeReservation(totalpeople, date, time, userid, storeid, storename, adultpax, childpax, reservationid);
        }
    } catch (error) {
        console.error('Error checking session:', error);

    }

}

async function populateFields() {
    console.log("running populateField");
    const response = await fetch(`/get_reservation_by_id?reservationid=${reservationid}`);
    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }
    reservationDetails = await response.json();
    const details = reservationDetails[0];

    document.getElementById('firstname').value = details.first_name;
    document.getElementById('lastname').value = details.last_name;
    document.getElementById('specialrequest').value = details.specialRequest;
}

async function makeReservation(totalpeople, date, time, userid, storeid, storename, adultpax, childpax, resrvationid) {
    try {
        // console.log("userid: " + userid);
        // console.log("Pax: " + totalpeople);
        // console.log("time: " + time);
        // console.log("date: " + date);
        // console.log("storeid: " + storeid);
        // console.log("storename: " + storename);

        document.getElementById("storename").innerHTML = storename;
        document.getElementById("totalpax").innerHTML = `👤 ${totalpeople}`;
        document.getElementById("date").innerHTML = `📅 ${date}`;
        document.getElementById("time").innerHTML = `🕑 ${time}`;

        // load first name and last name with db values
        const response = await fetch(`/get_name?userid=${userid}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        };
        const name = await response.json();
        console.log(name);
        document.getElementById('firstname').value = name[0].firstname;
        document.getElementById('lastname').value = name[0].lastname;

        const form = document.getElementById("completeReservation");
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const firstname = document.getElementById('firstname').value;
            console.log("firstname: " + firstname);

            const lastname = document.getElementById('lastname').value;
            console.log("lastname: " + lastname);

            const specialrequest = document.getElementById('specialrequest').value;
            console.log("specialrequest: " + specialrequest);

            let response;

            try {
                if (reservationid) {
                    console.log('running this');
                    response = await fetch('/update_reservation', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
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
                            storename,
                            reservationid
                        })
                    });

                } else {
                    response = await fetch(`/reserve?pax=${totalpeople}&date=${date}&time=${time}&userid=${userid}&storeid=${storeid}&firstname=${firstname}&lastname=${lastname}&specialrequest=${specialrequest}&storename=${storename}&adultpax=${adultpax}&childpax=${childpax}`);
                }

                const result = await response.json();

                // need tot throw error, then the catch work
                if (!response.ok) {
                    throw new Error(result.message || 'Reservation failed');
                } else {
                    // reservation successful
                    document.getElementById('popupMessage').textContent =
                        reservationid ? "Reservation updated successfully!" : "Reservation completed successfully!";
                    document.querySelector('.popup-icon').textContent = "✅";
                    document.getElementById('popupModal').style.display = 'flex';
                }


            } catch (error) {
                const errorMsg = document.getElementById('reserveError');
                if (errorMsg) {
                    errorMsg.textContent = error.message;
                    errorMsg.style.display = 'unset';
                    errorMsg.style.color = 'red';
                }
            }

        })



    } catch (err) {
        console.error('Error making reservation:', err);
        throw err;
    }
}

