// ========== SECTION NAVIGATION ==========
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

// ========== EXPORT RESERVATIONS TO CSV ==========
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
          <td>
            <button class="btn btn-sm btn-primary" onclick='editRestaurant(${JSON.stringify(store)})'>Edit</button>
          </td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => console.error('Error loading restaurants:', err));
}

// ========== EDIT RESTAURANT ==========
function editRestaurant(store) {
  console.log('Opening modal for:', store);

  document.getElementById('restaurantId').value = store.id ?? store.store_id;
  document.getElementById('storeName').value = store.storeName;
  document.getElementById('address').value = store.address;
  document.getElementById('postalCode').value = store.postalCode;
  document.getElementById('location').value = store.location;
  document.getElementById('cuisine').value = store.cuisine;
  document.getElementById('priceRange').value = store.priceRange;
  document.getElementById('totalCapacity').value = store.totalCapacity;
  document.getElementById('opening').value = store.opening;
  document.getElementById('closing').value = store.closing;

  document.getElementById('restaurantModalTitle').textContent = 'Edit Restaurant';
  document.getElementById('restaurantModalBtn').textContent = 'Update Restaurant';

  const modal = document.getElementById('myModal');
  if (modal) {
    modal.style.display = 'block';
  } else {
    console.error('Modal #myModal not found!');
  }
}

// ========== SUBMIT RESTAURANT FORM ==========
function submitRestaurantForm() {
  const id = document.getElementById('restaurantId').value;

  if (!id) {
    alert('Restaurant ID is missing.');
    return;
  }

  const storeData = {
    storeName: document.getElementById('storeName').value,
    address: document.getElementById('address').value,
    postalCode: document.getElementById('postalCode').value,
    location: document.getElementById('location').value,
    cuisine: document.getElementById('cuisine').value,
    priceRange: document.getElementById('priceRange').value,
    totalCapacity: parseInt(document.getElementById('totalCapacity').value, 10),
    opening: document.getElementById('opening').value,
    closing: document.getElementById('closing').value
  };

  fetch(`/api/owner/restaurants/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(storeData)
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to update restaurant');
      return res.json();
    })
    .then(() => {
      closeModal();
      fetchRestaurants();
    })
    .catch(err => {
      console.error('Update error:', err);
      alert('An error occurred while updating the restaurant.');
    });
}

// ========== CLOSE MODAL ==========
function closeModal() {
  const modal = document.getElementById('myModal');
  if (modal) {
    modal.style.display = 'none';
  }

  document.getElementById('restaurantId').value = '';
  document.querySelector('form').reset();
  document.getElementById('restaurantModalTitle').textContent = 'Request New Restaurant';
  document.getElementById('restaurantModalBtn').textContent = 'Send Request';
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
          <td>${reservation.first_name}</td>
          <td>${reservation.last_name}</td>
          <td>${reservation.storeName}</td>
          <td>${dateOnly}</td>
          <td>${reservation.reservationTime}</td>
          <td>${reservation.noOfGuest}</td>
          <td>
            ${reservation.status === 'Confirmed'
            ? `<button class="btn btn-sm btn-warning" onclick="cancelReservation(${reservation.reservation_id})">Cancel</button>`
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
    .then(() => {
      alert('Reservation cancelled!');
      fetchReservations();
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

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  showSection('myRestaurants');
});
