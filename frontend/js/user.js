window.addEventListener('DOMContentLoaded', () => {
  fetchUser();
  fetchReservations();
  fetchReviews();
  setupResetPasswordHandler();
  setupNameEditHandlers();
});

// ======== Fetch user details ======== 
function fetchUser() {
  fetch('/api/user/getUser')
    .then(res => res.json())
    .then(data => {
      document.getElementById('profileName').textContent = data.name;
      document.getElementById('firstName').textContent = data.firstname;
      document.getElementById('lastName').textContent = data.lastname;
      document.getElementById('profileEmail').textContent = data.email;
      document.getElementById('userName').textContent = data.name;
    })
    .catch(err => {
      console.error('Error loading user profile:', err);
    });
}

// ======== Fetch user reservations ======== 
function fetchReservations() {
  fetch('/api/user/reservations')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#reservationTable tbody');
      tableBody.innerHTML = '';
      data.forEach(reservation => {
        // Check if reservation date/time has passed
        const reservationDateTime = new Date(`${reservation.reservationDate}T${reservation.reservationTime}`);
        const now = new Date();
        const isPastReservation = now >= reservationDateTime;

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${reservation.storeName}</td>
          <td>${reservation.reservationDate}</td>
          <td>${reservation.reservationTime}</td>
          <td>${reservation.noOfGuest}</td>

          <td>
            ${(reservation.status === 'Confirmed' && !isPastReservation)
            ? `<button class="btn btn-sm btn-warning" onclick="cancelUserReservation(${reservation.reservation_id})">Cancel</button>`
            : (reservation.status === 'Confirmed' && isPastReservation)
              ? 'Completed'
              : reservation.status}
          </td>

          <td>${reservation.specialRequest || ''}</td>

          <td>
            ${(reservation.status === 'Confirmed' && !isPastReservation)
            ? `<button class="btn btn-sm" style="background-color: #fc6c3f; color: white;" onclick="editReservation(${reservation.store_id}, ${reservation.reservation_id})">Edit Reservation</button>`
            : "-"}
          </td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(err => {
      console.error('Error loading reservations:', err);
    });
}
// ========== CANCEL RESERVATION ==========
function cancelUserReservation(reservationId) {
  fetch(`/api/user/reservations/${reservationId}/cancel`, {
    method: 'PUT'
  })
    .then(res => res.json())
    .then(() => {
      alert('You have cancelled your reservation!');
      fetchReservations();
    })
    .catch(err => console.error('Error cancelling reservation:', err));
}


///  ======== Fetch reviews by the user ======== 
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

// ======== Reset password ======== 
function setupResetPasswordHandler() {
  const resetForm = document.getElementById('resetPasswordForm');

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (newPassword !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      try {
        const response = await fetch('/api/user/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword })
        });

        if (response.ok) {
          alert('Password has been reset successfully! You will be logged out.');
          await fetch('/logout', { method: 'POST' });
          window.location.href = '/login';
        } else {
          const result = await response.json();
          if (result.errors && Array.isArray(result.errors)) {
            const errorMessages = result.errors.map(err => err.msg).join('\n');
            alert(`Password requirements:\n${errorMessages}`);
          } else {
            alert('Failed to reset password. Please try again.');
          }
        }
      } catch (err) {
        console.error('Password reset failed:', err);
        alert('An error occurred while resetting the password.');
      }
    });
  }
}

// ======== Edit name function ======== 
function setupNameEditHandlers() {
  const editBtn = document.getElementById('editNameBtn');
  const nameDisplay = document.getElementById('profileName');
  const inputGroup = document.getElementById('editNameContainer');
  const inputField = document.getElementById('editNameInput');
  const saveBtn = document.getElementById('saveNameBtn');
  const cancelBtn = document.getElementById('cancelNameBtn');


  if (editBtn && inputGroup && inputField && saveBtn && cancelBtn && nameDisplay) {
    editBtn.addEventListener('click', () => {
      inputGroup.classList.remove('d-none');
      inputField.value = nameDisplay.textContent;
      inputField.focus();
    });


    cancelBtn.addEventListener('click', () => {
      inputGroup.classList.add('d-none');
      inputField.value = '';
    });

    saveBtn.addEventListener('click', async () => {
      const newName = inputField.value.trim();
      if (!newName) {
        alert('Name cannot be empty.');
        return;
      }

      try {
        const response = await fetch('/api/user/edit/username', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: newName })
        });

        const result = await response.json();

        if (response.ok) {
          alert('Name updated successfully.');
          nameDisplay.textContent = newName;
          document.getElementById('userName').textContent = newName;
          inputGroup.classList.add('d-none');
        } else {
          alert(result.message || 'Failed to update name.');
        }
      } catch (err) {
        console.error('Error updating name:', err);
        alert('An error occurred while updating name.');
      }
    });
  }
}

// Validation function for names (no digits allowed)
function validateNameNoNumbers(name) {
  return /^[A-Za-z\s'-]+$/.test(name);
}

// Show error modal for name validation errors
function showNameErrorModal(message) {
  const modalBody = document.getElementById('nameErrorModalBody');
  modalBody.textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('nameErrorModal'));
  modal.show();
}

// First Name Edit Handler
function setupFirstNameEditHandler() {
  const editBtn = document.getElementById('editFirstNameBtn');
  const nameDisplay = document.getElementById('firstName');
  const inputGroup = document.getElementById('editFirstNameContainer');
  const inputField = document.getElementById('editFirstNameInput');
  const saveBtn = document.getElementById('saveFirstNameBtn');
  const cancelBtn = document.getElementById('cancelFirstNameBtn');

  if (editBtn && inputGroup && inputField && saveBtn && cancelBtn && nameDisplay) {
    editBtn.addEventListener('click', () => {
      inputGroup.classList.remove('d-none');
      inputField.value = nameDisplay.textContent;
      inputField.focus();
    });

    cancelBtn.addEventListener('click', () => {
      inputGroup.classList.add('d-none');
      inputField.value = '';
    });

    saveBtn.addEventListener('click', async () => {
      const newFirstName = inputField.value.trim();
      if (!newFirstName) {
        showNameErrorModal('First name cannot be empty.');
        return;
      }
      if (!validateNameNoNumbers(newFirstName)) {
        showNameErrorModal('First name cannot contain numbers.');
        return;
      }

      try {
        const response = await fetch('/api/user/edit/firstname', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstname: newFirstName })
        });
        const result = await response.json();

        if (response.ok) {
          alert('First name updated successfully.');
          nameDisplay.textContent = newFirstName;
          inputGroup.classList.add('d-none');
        } else {
          showNameErrorModal(result.message || 'Failed to update first name.');
        }
      } catch (err) {
        console.error('Error updating first name:', err);
        showNameErrorModal('An error occurred while updating first name.');
      }
    });
  }
}

// Last Name Edit Handler
function setupLastNameEditHandler() {
  const editBtn = document.getElementById('editLastNameBtn');
  const nameDisplay = document.getElementById('lastName');
  const inputGroup = document.getElementById('editLastNameContainer');
  const inputField = document.getElementById('editLastNameInput');
  const saveBtn = document.getElementById('saveLastNameBtn');
  const cancelBtn = document.getElementById('cancelLastNameBtn');

  if (editBtn && inputGroup && inputField && saveBtn && cancelBtn && nameDisplay) {
    editBtn.addEventListener('click', () => {
      inputGroup.classList.remove('d-none');
      inputField.value = nameDisplay.textContent;
      inputField.focus();
    });

    cancelBtn.addEventListener('click', () => {
      inputGroup.classList.add('d-none');
      inputField.value = '';
    });

    saveBtn.addEventListener('click', async () => {
      const newLastName = inputField.value.trim();
      if (!newLastName) {
        showNameErrorModal('Last name cannot be empty.');
        return;
      }
      if (!validateNameNoNumbers(newLastName)) {
        showNameErrorModal('Last name cannot contain numbers.');
        return;
      }

      try {
        const response = await fetch('/api/user/edit/lastname', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastname: newLastName })
        });
        const result = await response.json();

        if (response.ok) {
          alert('Last name updated successfully.');
          nameDisplay.textContent = newLastName;
          inputGroup.classList.add('d-none');
        } else {
          showNameErrorModal(result.message || 'Failed to update last name.');
        }
      } catch (err) {
        console.error('Error updating last name:', err);
        showNameErrorModal('An error occurred while updating last name.');
      }
    });
  }
}

// Call these when page loads
setupFirstNameEditHandler();
setupLastNameEditHandler();




// ======== edit reservation ==========
async function editReservation(storeid, reservationid) {

  try {
    const response = await fetch(`/maxcapacity?storeid=${storeid}`);
    if (!response.ok) {
      throw new Error('Failed to fetch data');
    }

    const store = await response.json();
    console.log("store: ", store[0]);


    window.location.href = `/selectedRes?name=${encodeURIComponent(store[0].storeName)}&location=${encodeURIComponent(store[0].location)}&reservationid=${reservationid}`;

  } catch (error) {
    console.error('Error editing reservation:', error);
  }
}


