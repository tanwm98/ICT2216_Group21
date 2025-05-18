function showSection(id) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');

  if (id === 'restaurants') {
    fetchRestaurants();
  } else if (id === 'users') {
    fetchUsers();
  }
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

// ========== MODALS ==========
// Restaurant Modal
var restaurantModal = document.getElementById("myModal");

function openModal() {
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
