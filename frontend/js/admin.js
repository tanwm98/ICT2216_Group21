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


// =================  DASHBOARD ==============
// load dashboard
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


// =============== RESTAURANTS ==============
// fetch restaurant info
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

// submit restaurant form
function submitRestaurantForm() {
  const restaurantId = document.getElementById("restaurantId").value;
  if (restaurantId) {
    updateRestaurant(restaurantId);
  } else {
    addRestaurant();
  }
}

// add restaurant
function addRestaurant() {
  const form = document.getElementById('restaurantForm');
  const formData = new FormData(form);

  // Manually add owner_id from the <select>
  const ownerId = document.getElementById('ownerSelect').value;
  formData.set('owner_id', ownerId);

  const file = formData.get('image');
  console.log('Attached image:', file); // Should be a File object

  fetch('/api/restaurants', {
    method: 'POST',
    body: formData, // Don't set Content-Type!
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

// update restaurant
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

/// edit restaurant
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

// clear restaurant form
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

// get restaurant form
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



// load owner dashboard
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

/// get restaurant form
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

// clear restaurant form
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

// submit restaurant form
function submitRestaurantForm() {
  const restaurantId = document.getElementById("restaurantId").value;
  if (restaurantId) {
    updateRestaurant(restaurantId);
  } else {
    addRestaurant();
  }
}

// edit restaurant
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

// delete restaurant
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



// ========== USERS ==========
// fetch user info
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

// submit user form
function submitUserForm() {
  const userId = document.getElementById("userId").value;
  if (userId) {
    updateUser(userId);
  } else {
    addUser();
  }
}

// add user
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

// update user details
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

// clear user form
function clearUserForm() {
  document.getElementById("userId").value = '';
  document.getElementById("name").value = '';
  document.getElementById("email").value = '';
  document.getElementById("role").value = '';

  document.getElementById("userModalTitle").textContent = "Add New User";
  document.getElementById("userModalBtn").textContent = "Add User";
}

// edit user 
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

// delete user
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

// reset user password
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
            ${resv.status === 'Confirmed'
            ? `<button data-id="${resv.reservation_id}" class="confirm-btn">cancel</button>`
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
          cancelReservation(id);
        });
      });
    })
    .catch(err => {
      console.error('Failed to fetch reservations:', err);
    });
}

function cancelReservation(id) {
  fetch(`/api/reservations/${id}/cancel`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(res => res.json())
    .then(data => {
      fetchReservations(); // Refresh the table
    })
    .catch(err => {
      console.error('Error cancelling reservation:', err);
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