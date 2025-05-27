function showSection(id) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');

  if (id === 'myRestaurants') {
    fetchRestaurants();
  } else if (id === 'reservations') {
    fetchReservations();
  } else if (id === 'reviews') {
    fetchReviews();
  }
}

function exportReservationsToCSV() {
    const table = document.getElementById("reservationTable");
    let csv = [];
    const rows = table.querySelectorAll("tr");

    for (let row of rows) {
        const cols = row.querySelectorAll("th, td");
        let csvRow = [];
        for (let col of cols) {
            let text = col.innerText.replace(/"/g, '""'); // Escape double quotes
            csvRow.push(`"${text}"`);
        }
        csv.push(csvRow.join(","));
    }

    // Create a CSV Blob and trigger download
    const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reservations.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ========== FETCH & DISPLAY OWNER'S RESTAURANTS ==========
function fetchRestaurants() {
  fetch('/api/owner/restaurants')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#restaurantTable tbody');
      tableBody.innerHTML = '';

      data.forEach(store => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${store.storeName}</td>
          <td>${store.address}</td>
          <td>${store.postalCode}</td>
          <td>${store.location}</td>
          <td>${store.cuisine}</td>
          <td>${store.priceRange}</td>
          <td>${store.totalCapacity}</td>
          <td>${store.opening}</td>
          <td>${store.closing}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => console.error('Error loading restaurants:', err));
}

// ========== FETCH & DISPLAY OWNER'S RESERVATIONS ==========
function fetchReservations() {
  fetch('/api/owner/reservations/me')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#reservationTable tbody');
      tableBody.innerHTML = '';

      data.forEach(reservation => {
        const dateOnly = reservation.reservationDate.split('T')[0];  
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${reservation.userName}</td>
          <td>${reservation.storeName}</td>
          <td>${dateOnly}</td>
          <td>${reservation.reservationTime}</td>
          <td>${reservation.noOfGuest}</td>
          <td>
            ${reservation.status === 'confirmed'
            ? `<button class="btn btn-sm btn-warning" onclick="cancelReservation(${reservation.reservation_id})">cancel</button>`
            : reservation.status}
          </td>
          <td>${reservation.specialRequest || ''}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => console.error('Error loading reservations:', err));
}

// ========== CANCEL RESERVATION ==========
function cancelReservation(reservationId) {
  fetch(`/api/owner/reservations/${reservationId}/cancel`, {
    method: 'PUT'
  })
    .then(res => res.json())
    .then(data => {
      alert('Reservation cancelled!');
      fetchReservations(); // Refresh the list
    })
    .catch(err => console.error('Error cancelling reservation:', err));
}

// ========== FETCH & DISPLAY OWNER'S REVIEWS ==========
function fetchReviews() {
  fetch('/api/owner/reviews/me')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#reviewTable tbody');
      tableBody.innerHTML = '';

      data.forEach(review => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${review.storeName}</td>
          <td>${review.userName}</td>
          <td>${review.rating}</td>
          <td>${review.description}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => console.error('Error loading reviews:', err));
}

window.addEventListener('DOMContentLoaded', () => {
  showSection('myRestaurants'); // this will call fetchRestaurants()
});