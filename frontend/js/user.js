// ADD: HTML entity decoding functions at the top
function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ADD: Simple and comprehensive HTML entity decoding
function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;

    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

window.addEventListener('DOMContentLoaded', () => {
  fetchUser();
  fetchReservations();
  fetchReviews();
  setupResetPasswordHandler();
  setupNameEditHandlers();
  setupFirstNameEditHandler();
  setupLastNameEditHandler();
});

// ======== Fetch user details ========
// FIXED: Decode user data before displaying
function fetchUser() {
  fetch('/api/user/getUser')
    .then(res => res.json())
    .then(data => {
      // Decode all user data before displaying
      document.getElementById('profileName').textContent = decodeHtmlEntities(data.name || '');
      document.getElementById('firstName').textContent = decodeHtmlEntities(data.firstname || '');
      document.getElementById('lastName').textContent = decodeHtmlEntities(data.lastname || '');
      document.getElementById('profileEmail').textContent = decodeHtmlEntities(data.email || '');
      document.getElementById('userName').textContent = decodeHtmlEntities(data.name || '');
    })
    .catch(err => {
      console.error('Error loading user profile:', err);
    });
}

// ======== Fetch user reservations ========
// FIXED: Decode reservation data before displaying
function fetchReservations() {
  fetch('/api/user/reservations')
      .then(res => res.json())
      .then(data => {
        const tableBody = document.querySelector('#reservationTable tbody');
        tableBody.innerHTML = '';

        data.forEach(reservation => {
          const reservationDateTime = new Date(`${reservation.reservationDate}T${reservation.reservationTime}`);
          const now = new Date();
          const isPastReservation = now >= reservationDateTime;

          const row = document.createElement('tr');

          // FIXED: Store cell with decoded store name
          const storeCell = document.createElement('td');
          storeCell.textContent = decodeHtmlEntities(reservation.storeName || '');
          row.appendChild(storeCell);

          // Date cell
          const dateCell = document.createElement('td');
          dateCell.textContent = reservation.reservationDate;
          row.appendChild(dateCell);

          // Time cell
          const timeCell = document.createElement('td');
          timeCell.textContent = reservation.reservationTime;
          row.appendChild(timeCell);

          // Guest count cell
          const guestCell = document.createElement('td');
          guestCell.textContent = reservation.noOfGuest;
          guestCell.style.textAlign = 'center';
          row.appendChild(guestCell);

          // Status cell with improved button handling
          const statusCell = document.createElement('td');
          if (reservation.status === 'Confirmed' && !isPastReservation) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-sm btn-warning action-btn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => cancelUserReservation(reservation.reservation_id));
            statusCell.appendChild(cancelBtn);
          } else if (reservation.status === 'Confirmed' && isPastReservation) {
            statusCell.textContent = 'Completed';
          } else {
            statusCell.textContent = reservation.status;
          }
          row.appendChild(statusCell);

          // FIXED: Special request cell with decoded content
          const specialRequestCell = document.createElement('td');
          const specialRequestDiv = document.createElement('div');
          specialRequestDiv.className = 'special-request-cell';

          const decodedSpecialRequest = decodeHtmlEntities(reservation.specialRequest || '');
          specialRequestDiv.textContent = decodedSpecialRequest || '-';

          // Add tooltip for long content
          if (decodedSpecialRequest && decodedSpecialRequest.length > 50) {
            specialRequestDiv.title = decodedSpecialRequest;
          }

          specialRequestCell.appendChild(specialRequestDiv);
          row.appendChild(specialRequestCell);

          // Edit cell with improved button container
          const editCell = document.createElement('td');
          const buttonContainer = document.createElement('div');
          buttonContainer.className = 'action-buttons-container';

          if (reservation.status === 'Confirmed' && !isPastReservation) {
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm btn-edit-reservation action-btn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => editReservation(reservation.store_id, reservation.reservation_id));
            buttonContainer.appendChild(editBtn);
          } else {
            const disabledText = document.createElement('span');
            disabledText.textContent = '-';
            disabledText.className = 'text-muted';
            buttonContainer.appendChild(disabledText);
          }

          editCell.appendChild(buttonContainer);
          row.appendChild(editCell);

          tableBody.appendChild(row);
        });
      })
      .catch(err => {
        console.error('Error loading reservations:', err);
      });
}

// ========== CANCEL RESERVATION ==========
function cancelUserReservation(reservationId) {
  window.csrfFetch(`/api/user/reservations/${reservationId}/cancel`, {
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
// FIXED: Decode review data before displaying
function fetchReviews() {
  fetch('/api/user/reviews')
    .then(res => res.json())
    .then(data => {
      const tableBody = document.querySelector('#reviewTable tbody');
      tableBody.innerHTML = '';

      data.forEach(review => {
        const row = document.createElement('tr');

        // FIXED: Store name cell with decoded content
        const storeNameCell = document.createElement('td');
        storeNameCell.textContent = decodeHtmlEntities(review.storeName || '');

        const ratingCell = document.createElement('td');
        ratingCell.textContent = review.rating;

        // FIXED: Description cell with decoded content
        const descriptionCell = document.createElement('td');
        const descriptionDiv = document.createElement('div');
        descriptionDiv.className = 'special-request-cell';

        const decodedDescription = decodeHtmlEntities(review.description || '');
        descriptionDiv.textContent = decodedDescription;

        // Add tooltip for long reviews
        if (decodedDescription && decodedDescription.length > 100) {
          descriptionDiv.title = decodedDescription;
        }

        descriptionCell.appendChild(descriptionDiv);

        row.appendChild(storeNameCell);
        row.appendChild(ratingCell);
        row.appendChild(descriptionCell);

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
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (newPassword !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      try {
        const response = await window.csrfFetch('/api/user/reset-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword })
        });

        let result;
        try {
          result = await response.json();
        } catch (jsonError) {
          result = {};
        }

        if (response.ok) {
          alert('Password has been reset successfully! You will be logged out.');
          await fetch('/logout', { method: 'POST' });
          window.location.href = '/login';
        } else {
          if (result.error) {
            alert(result.error);
          } else if (result.errors && Array.isArray(result.errors)) {
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
// FIXED: Handle decoded names in edit handlers
function setupNameEditHandlers() {
  const editBtn = document.getElementById('editNameBtn');
  const nameDisplay = document.getElementById('profileName');
  const inputGroup = document.getElementById('editNameContainer');
  const inputField = document.getElementById('editNameInput');
  const saveBtn = document.getElementById('saveNameBtn');
  const cancelBtn = document.getElementById('cancelNameBtn');

  if (editBtn && inputGroup && inputField && saveBtn && cancelBtn && nameDisplay) {
    editBtn.addEventListener('click', () => {
      inputGroup.classList.remove('hidden');
      // Get current decoded text from display
      inputField.value = nameDisplay.textContent;
      inputField.focus();
    });

    cancelBtn.addEventListener('click', () => {
      inputGroup.classList.add('hidden');
      inputField.value = '';
    });

    saveBtn.addEventListener('click', async () => {
      const newName = inputField.value.trim();
      if (!newName) {
        alert('Name cannot be empty.');
        return;
      }

      try {
        const response = await window.csrfFetch('/api/user/edit/username', {
          method: 'PUT',
          body: JSON.stringify({ name: newName })
        });
        const result = await response.json();

        if (response.ok) {
          alert('Name updated successfully.');
          // Update display with the new name (no need to decode since it's user input)
          nameDisplay.textContent = newName;
          document.getElementById('userName').textContent = newName;
          inputGroup.classList.add('hidden');
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

// FIXED: First Name Edit Handler with proper decoding
function setupFirstNameEditHandler() {
  const editBtn = document.getElementById('editFirstNameBtn');
  const nameDisplay = document.getElementById('firstName');
  const inputGroup = document.getElementById('editFirstNameContainer');
  const inputField = document.getElementById('editFirstNameInput');
  const saveBtn = document.getElementById('saveFirstNameBtn');
  const cancelBtn = document.getElementById('cancelFirstNameBtn');

  if (editBtn && inputGroup && inputField && saveBtn && cancelBtn && nameDisplay) {
    editBtn.addEventListener('click', () => {
      inputGroup.classList.remove('hidden');
      // Get current decoded text from display
      inputField.value = nameDisplay.textContent;
      inputField.focus();
    });

    cancelBtn.addEventListener('click', () => {
      inputGroup.classList.add('hidden');
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
        const response = await window.csrfFetch('/api/user/edit/firstname', {
          method: 'PUT',
          body: JSON.stringify({ firstname: newFirstName })
        });
        const result = await response.json();

        if (response.ok) {
          alert('First name updated successfully.');
          // Update display with the new name (no need to decode since it's user input)
          nameDisplay.textContent = newFirstName;
          inputGroup.classList.add('hidden');
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

// FIXED: Last Name Edit Handler with proper decoding
function setupLastNameEditHandler() {
  const editBtn = document.getElementById('editLastNameBtn');
  const nameDisplay = document.getElementById('lastName');
  const inputGroup = document.getElementById('editLastNameContainer');
  const inputField = document.getElementById('editLastNameInput');
  const saveBtn = document.getElementById('saveLastNameBtn');
  const cancelBtn = document.getElementById('cancelLastNameBtn');

  if (editBtn && inputGroup && inputField && saveBtn && cancelBtn && nameDisplay) {
    editBtn.addEventListener('click', () => {
      inputGroup.classList.remove('hidden');
      // Get current decoded text from display
      inputField.value = nameDisplay.textContent;
      inputField.focus();
    });

    cancelBtn.addEventListener('click', () => {
      inputGroup.classList.add('hidden');
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
        const response = await window.csrfFetch('/api/user/edit/lastname', {
          method: 'PUT',
          body: JSON.stringify({ lastname: newLastName })
        });
        const result = await response.json();

        if (response.ok) {
          alert('Last name updated successfully.');
          // Update display with the new name (no need to decode since it's user input)
          nameDisplay.textContent = newLastName;
          inputGroup.classList.add('hidden');
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

// ======== edit reservation ==========
// FIXED: Decode store data before creating URL
async function editReservation(storeid, reservationid) {
  try {
    const response = await fetch(`/maxcapacity?storeid=${storeid}`);
    if (!response.ok) {
      throw new Error('Failed to fetch data');
    }

    const store = await response.json();
    console.log("store: ", store[0]);

    // FIXED: Decode store name and location before URL encoding
    const decodedStoreName = decodeHtmlEntities(store[0].storeName || '');
    const decodedLocation = decodeHtmlEntities(store[0].location || '');

    window.location.href = `/selectedRes?name=${encodeURIComponent(decodedStoreName)}&location=${encodeURIComponent(decodedLocation)}&reservationid=${reservationid}`;

  } catch (error) {
    console.error('Error editing reservation:', error);
  }
}