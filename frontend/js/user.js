window.addEventListener('DOMContentLoaded', () => {
  fetchUser();
  fetchReservations();
  fetchReviews();
});

function fetchUser() {
  fetch('/api/user/getUser')
    .then(res => res.json())
    .then(data => {
      document.getElementById('profileName').textContent = data.name;
      document.getElementById('profileEmail').textContent = data.email;
      document.getElementById('userName').textContent = data.name;
    })
    .catch(err => {
      console.error('Error loading user profile:', err);
    });
}

function fetchReservations() {
  fetch('/api/user/reservations')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#reservationTable tbody');
      tableBody.innerHTML = '';
      data.forEach(reservation => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${reservation.storeName}</td>
          <td>${reservation.reservationDate}</td>
          <td>${reservation.reservationTime}</td>
          <td>${reservation.noOfGuest}</td>
          <td>${reservation.status}</td>
          <td>${reservation.specialRequest || ''}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Error loading reservations:', err);
    });
}

function fetchReviews() {
  fetch('/api/user/reviews')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#reviewTable tbody');
      tableBody.innerHTML = '';
      data.forEach(review => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${review.storeName}</td>
          <td>${review.rating}</td>
          <td>${review.description}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Error loading reviews:', err);
    });
}