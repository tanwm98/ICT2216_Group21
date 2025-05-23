function showSection(id) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');

  if (id === 'restaurants') {
    fetchRestaurants();
  } else if (id === 'users') {
    fetchUsers();
  } else if (id === 'dashboard') {
    loadDashboardStats();
  } else if (id === 'reservations') {
    fetchReservations();
  }
}
// ==========  DASHBOARD ========== 
function loadDashboardStats() {
  fetch('/api/dashboard-stats')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then(stats => {
      document.getElementById('totalUsers').textContent = stats.totalUsers ?? 'N/A';
      document.getElementById('totalRestaurants').textContent = stats.totalRestaurants ?? 'N/A';
      document.getElementById('totalReservations').textContent = stats.totalReservations ?? 'N/A';
      
      // Display top-rated restaurant by average rating
      if (stats.topRatedRestaurant && stats.topAverageRating !== undefined) {
        document.getElementById('topReviewCount').textContent = stats.topAverageRating;
        document.getElementById('topRestaurantName').textContent = stats.topRatedRestaurant;
      } else {
        document.getElementById('topReviewCount').textContent = '0';
        document.getElementById('topRestaurantName').textContent = 'N/A';
      }
    })
    .catch(err => {
      console.error('Failed to load dashboard stats:', err);
    });
}

// ========== RESTAURANTS ==========
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

function submitRestaurantForm() {
  const restaurantId = document.getElementById("restaurantId").value;
  if (restaurantId) {
    updateRestaurant(restaurantId);
  } else {
    addRestaurant();
  }
}

function addRestaurant() {
  const data = getRestaurantFormData();

  fetch('/api/restaurants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to add restaurant');
      return res.json();
    })
    .then(() => {
      closeModal();
      fetchRestaurants();
      clearRestaurantForm();
    })
    .catch(err => console.error('Error adding restaurant:', err));
}

function updateRestaurant(id) {
  const data = getRestaurantFormData();

  fetch(`/api/restaurants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to update restaurant');
      return res.json();
    })
    .then(() => {
      closeModal();
      fetchRestaurants();
      clearRestaurantForm();
    })
    .catch(err => console.error('Error updating restaurant:', err));
}

function editRestaurant(id) {
  fetch(`/api/restaurants/${id}`)
    .then(res => res.json())
    .then(r => {
      document.getElementById("restaurantId").value = r.store_id;
      document.getElementById("storeName").value = r.storeName;
      document.getElementById("address").value = r.address;
      document.getElementById("postalCode").value = r.postalCode;
      document.getElementById("cuisine").value = r.cuisine;
      document.getElementById("location").value = r.location;
      document.getElementById("priceRange").value = r.priceRange;
      document.getElementById("totalCapacity").value = r.totalCapacity;
      document.getElementById("opening").value = r.opening;
      document.getElementById("closing").value = r.closing;

      document.getElementById("restaurantModalBtn").textContent = "Update Restaurant";
      openModal();
    })
    .catch(err => console.error('Error loading restaurant:', err));
}

function clearRestaurantForm() {
  document.getElementById("restaurantId").value = '';
  document.getElementById("storeName").value = '';
  document.getElementById("address").value = '';
  document.getElementById("postalCode").value = '';
  document.getElementById("cuisine").value = '';
  document.getElementById("location").value = '';
  document.getElementById("priceRange").value = '';
  document.getElementById("totalCapacity").value = '';
  document.getElementById("opening").value = '';
  document.getElementById("closing").value = '';

  document.getElementById("restaurantModalBtn").textContent = "Add Restaurant";
}

function getRestaurantFormData() {
  return {
    storeName: document.getElementById("storeName").value,
    address: document.getElementById("address").value,
    postalCode: document.getElementById("postalCode").value,
    cuisine: document.getElementById("cuisine").value,
    location: document.getElementById("location").value,
    priceRange: document.getElementById("priceRange").value,
    totalCapacity: parseInt(document.getElementById("totalCapacity").value),
    opening: document.getElementById("opening").value,
    closing: document.getElementById("closing").value
  };
}

// ========== USERS ==========
function fetchUsers() {
  fetch('/api/users')
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#userList tbody');
      tbody.innerHTML = '';
      data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.role}</td>
          <td>
            <button class="btn btn-sm btn-warning" onclick="editUser(${user.user_id})">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn btn-sm btn-secondary" onclick="resetUserPassword(${user.user_id})">
              <i class="bi bi-key"></i> Reset
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.user_id})">
              <i class="bi bi-trash"></i> Delete
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Failed to fetch users:', err);
    });
}

function submitUserForm() {
  const userId = document.getElementById("userId").value;
  if (userId) {
    updateUser(userId);
  } else {
    addUser();
  }
}

function addUser() {
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const roleSelect = document.getElementById("role");

  const name = nameInput.value;
  const email = emailInput.value;
  const role = roleSelect.value;

  fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, email, role })
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to add user');
      return res.json();
    })
    .then(data => {
      console.log(data.message);

      // Clear the input fields
      nameInput.value = '';
      emailInput.value = '';
      roleSelect.value = '';

      closeUserModal();
      fetchUsers();
    })
    .catch(err => {
      console.error('Error adding user:', err);
    });
}

function updateUser(userId) {
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const role = document.getElementById("role").value;

  fetch(`/api/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, role })
  })
    .then(res => res.json())
    .then(() => {
      closeUserModal();
      fetchUsers();
      clearUserForm();
    })
    .catch(err => console.error('Error updating user:', err));
}

function clearUserForm() {
  document.getElementById("userId").value = '';
  document.getElementById("name").value = '';
  document.getElementById("email").value = '';
  document.getElementById("role").value = '';

  document.getElementById("userModalTitle").textContent = "Add New User";
  document.getElementById("userModalBtn").textContent = "Add User";
}

function editUser(userId) {
  fetch(`/api/users/${userId}`)
    .then(res => res.json())
    .then(user => {
      document.getElementById("userId").value = user.user_id;
      document.getElementById("name").value = user.name;
      document.getElementById("email").value = user.email;
      document.getElementById("role").value = user.role;

      document.getElementById("userModalTitle").textContent = "Edit User";
      document.getElementById("userModalBtn").textContent = "Update User";

      openUserModal();
    })
    .catch(err => console.error('Error loading user:', err));
}

function deleteUser(userId) {
  if (!confirm("Are you sure you want to delete this user?")) return;

  fetch(`/api/users/${userId}`, {
    method: 'DELETE',
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to delete user');
      return res.json();
    })
    .then(data => {
      console.log(data.message);
      fetchUsers(); // refresh the list
    })
    .catch(err => {
      console.error('Error deleting user:', err);
    });
}

function resetUserPassword(userId) {
  if (!confirm('Reset this user\'s password?')) return;

  fetch(`/api/users/${userId}/reset-password`, {
    method: 'POST'
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message || 'Password reset');
    })
    .catch(err => {
      console.error('Failed to reset password:', err);
    });
}

// ========== RESTAURANTS ==========
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

function loadOwnersDropdown(selectedId = '') {
  fetch('/api/owners')
    .then(res => res.json())
    .then(owners => {
      const ownerSelect = document.getElementById('ownerSelect');
      ownerSelect.innerHTML = '<option value="">Select Owner</option>';
      owners.forEach(owner => {
        const option = document.createElement('option');
        option.value = owner.user_id;
        option.textContent = owner.name;
        if (owner.user_id == selectedId) option.selected = true;
        ownerSelect.appendChild(option);
      });
    })
    .catch(err => {
      console.error('Failed to load owners:', err);
    });
}

function getRestaurantFormData() {
  return {
    storeName: document.getElementById("storeName").value,
    address: document.getElementById("address").value,
    postalCode: document.getElementById("postalCode").value,
    location: document.getElementById("location").value,
    cuisine: document.getElementById("cuisine").value,
    priceRange: document.getElementById("priceRange").value,
    totalCapacity: parseInt(document.getElementById("totalCapacity").value),
    opening: document.getElementById("opening").value,
    closing: document.getElementById("closing").value,
    owner_id: document.getElementById("ownerSelect").value
  };
}

function clearRestaurantForm() {
  document.getElementById("restaurantId").value = '';
  document.getElementById("storeName").value = '';
  document.getElementById("address").value = '';
  document.getElementById("postalCode").value = '';
  document.getElementById("location").value = '';
  document.getElementById("cuisine").value = '';
  document.getElementById("priceRange").value = '';
  document.getElementById("totalCapacity").value = '';
  document.getElementById("opening").value = '';
  document.getElementById("closing").value = '';
  document.getElementById("ownerSelect").value = '';

  document.getElementById("restaurantModalTitle").textContent = "Add New Restaurant";
  document.getElementById("restaurantModalBtn").textContent = "Add Restaurant";
}

function submitRestaurantForm() {
  const restaurantId = document.getElementById("restaurantId").value;
  if (restaurantId) {
    updateRestaurant(restaurantId);
  } else {
    addRestaurant();
  }
}

function addRestaurant() {
  const data = getRestaurantFormData();

  fetch('/api/restaurants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to add restaurant');
      return res.json();
    })
    .then(() => {
      closeModal();
      fetchRestaurants();
      clearRestaurantForm();
    })
    .catch(err => console.error('Error adding restaurant:', err));
}

function updateRestaurant(id) {
  const data = getRestaurantFormData();

  fetch(`/api/restaurants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to update restaurant');
      return res.json();
    })
    .then(() => {
      closeModal();
      fetchRestaurants();
      clearRestaurantForm();
    })
    .catch(err => console.error('Error updating restaurant:', err));
}

function editRestaurant(id) {
  fetch(`/api/restaurants/${id}`)
    .then(res => res.json())
    .then(r => {
      document.getElementById("restaurantId").value = r.store_id;
      document.getElementById("storeName").value = r.storeName;
      document.getElementById("address").value = r.address;
      document.getElementById("postalCode").value = r.postalCode;
      document.getElementById("location").value = r.location;
      document.getElementById("cuisine").value = r.cuisine;
      document.getElementById("priceRange").value = r.priceRange;
      document.getElementById("totalCapacity").value = r.totalCapacity;
      document.getElementById("opening").value = r.opening;
      document.getElementById("closing").value = r.closing;

      document.getElementById("restaurantModalTitle").textContent = "Edit Restaurant";
      document.getElementById("restaurantModalBtn").textContent = "Update Restaurant";

      loadOwnersDropdown(r.owner_id);
      openModal(true);
    })
    .catch(err => console.error('Error loading restaurant:', err));
}

function deleteRestaurant(storeId) {
  if (!confirm("Are you sure you want to delete this restaurant?")) return;

  fetch(`/api/restaurants/${storeId}`, {
    method: 'DELETE'
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to delete restaurant');
      return res.json();
    })
    .then(data => {
      console.log(data.message || 'Deleted successfully');
      fetchRestaurants(); // refresh list
    })
    .catch(err => {
      console.error('Error deleting restaurant:', err);
    });
}

// ========== RESERVATIONS ==========
function fetchReservations() {
  fetch('/api/reservations')
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#reservationList tbody');
      tbody.innerHTML = '';
      data.forEach(resv => {
        const date = new Date(resv.reservationDate).toISOString().split('T')[0]; // YYYY-MM-DD
        const time = resv.reservationTime.slice(0, 5); // HH:MM

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${resv.userName}</td>
          <td>${resv.restaurantName}</td>
          <td>${resv.noOfGuest}</td>
          <td>${resv.reservationDate}</td>
          <td>${time}</td>
          <td>${resv.status}</td>
          <td>${resv.specialRequest || '-'}</td>
<td>
            ${resv.status === 'pending'
            ? `<button data-id="${resv.reservation_id}" class="confirm-btn">Confirm</button>`
            : '-'
          }
          </td>
        `;
        tbody.appendChild(row);
      });

      // Attach event listeners to the confirm buttons
      document.querySelectorAll('.confirm-btn').forEach(button => {
        button.addEventListener('click', () => {
          const id = button.getAttribute('data-id');
          confirmReservation(id);
        });
      });
    })
    .catch(err => {
      console.error('Failed to fetch reservations:', err);
    });
}

function confirmReservation(id) {
  fetch(`/api/reservations/${id}/confirm`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(res => res.json())
    .then(data => {
      console.log('Reservation confirmed:', data);
      fetchReservations(); // Refresh the table
    })
    .catch(err => {
      console.error('Error confirming reservation:', err);
    });
}


// ========== MODALS ==========
// Restaurant Modal
var restaurantModal = document.getElementById("myModal");

function openModal(isEdit = false) {
  if (!isEdit) {
    clearRestaurantForm();
    document.getElementById("restaurantModalTitle").textContent = "Add New Restaurant";
    document.getElementById("restaurantModalBtn").textContent = "Add Restaurant";
    loadOwnersDropdown(); // no pre-selection
  }

  restaurantModal.style.display = "block";
}

function closeModal() {
  restaurantModal.style.display = "none";
}

// User Modal
var userModal = document.getElementById("userModal");

function openUserModal() {
  userModal.style.display = "block";

}

function closeUserModal() {
  userModal.style.display = "none";
}

// Close modals if clicked outside
window.onclick = function (event) {
  if (event.target == restaurantModal) {
    closeModal();
  }
  if (event.target == userModal) {
    closeUserModal();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadDashboardStats();
});