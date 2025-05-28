let userid;

window.onload = function () {
    const data = JSON.parse(sessionStorage.getItem('reservationData'));
    console.log(data);

    const totalpeople = data.totalpeople;
    const date = data.date;
    const time = data.time;
    const storeid = data.storeid;

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
                makeReservation(totalpeople, date, time, userid, storeid);
            }
        })
        .catch(error => {
            console.error('Error checking session:', error);
        });



}

async function makeReservation(totalpeople, date, time, userid, storeid) {
    try {
        console.log("userid: " + userid);
        console.log("Pax: " + totalpeople);
        console.log("time: " + time);
        console.log("date: " + date);
        console.log("storeid: " + storeid);
        // const response = await fetch(`http://localhost:3000/reserve?pax=${totalpeople}&date=${date}&time=${time}&userid=${userid}&storeid=${storeid}`);
        // if (!response.ok) {
        //     throw new Error('Failed to fetch data');
        // }
        const data = await response.json();
        return data; // if needed
    } catch (err) {
        console.error('Error making reservation:', err);
        throw err;
    }
}
