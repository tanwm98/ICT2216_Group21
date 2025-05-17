function showSection(id) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');

  if (id === 'restaurants') {
    fetchRestaurants();
  }
}

function fetchRestaurants() {
  fetch('/api/restaurants')
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#restaurantList tbody');
      tbody.innerHTML = '';
      data.forEach(r => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${r.storeName}</td>
          <td>${r.location}</td>
          <td>${r.ownerName}</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="editRestaurant(${r.store_id})">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteRestaurant(${r.store_id})">
              <i class="bi bi-trash"></i> Delete
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Failed to fetch restaurants:', err);
    });
}

// Modal handling
var modal = document.getElementById("myModal");

function openModal() {
  modal.style.display = "block";
}

function closeModal() {
  modal.style.display = "none";
}

window.onclick = function (event) {
  if (event.target == modal) {
    closeModal();
  }
}
