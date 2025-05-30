let userid;

window.onload = function () {
    const data = JSON.parse(sessionStorage.getItem('reservationData'));
    console.log(data);

    const totalpeople = data.totalpeople;
    const date = data.date;
    const time = data.time;
    const storeid = data.storeid;
    const storename = data.storename;

    // retrieve current userid
    fetch('/api/session')
        .then(response => response.json())
        .then(data => {
            const reserveBtn = document.getElementById('reserveBtn');
            if (!data.loggedIn) {
                window.location.href = '/login';
            } else {
                userid = data.userId;
                console.log("Userid: " + userid);
                makeReservation(totalpeople, date, time, userid, storeid, storename);
            }
        })
        .catch(error => {
            console.error('Error checking session:', error);
        });



}

async function makeReservation(totalpeople, date, time, userid, storeid, storename) {
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

        const form = document.getElementById("completeReservation");
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const firstname = document.getElementById('firstname').value;
            console.log("firstname: " + firstname);

            const lastname = document.getElementById('lastname').value;
            console.log("lastname: " + lastname);

            const specialrequest = document.getElementById('specialrequest').value;
            console.log("specialrequest: " + specialrequest);

            try {
                const response = await fetch(`/reserve?pax=${totalpeople}&date=${date}&time=${time}&userid=${userid}&storeid=${storeid}&firstname=${firstname}&lastname=${lastname}&specialrequest=${specialrequest}`);

                const result = await response.json();

                // need tot throw error, then the catch work
                if (!response.ok) {
                    throw new Error(result.message || 'Reservation failed');
                } else {
                    // reservation successful
                    document.getElementById('popupMessage').textContent = "Reservation completed successfully!";
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
