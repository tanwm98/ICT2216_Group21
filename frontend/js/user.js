window.addEventListener('DOMContentLoaded', () => {
  fetchUser();
  fetchReservations();
  fetchReviews();
  setupResetPasswordHandler();
  setupNameEditHandlers();
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

      if (newPassword.length < 5) {
        alert('Password must be at least 5 characters long.');
        return;
      }

      try {
        const response = await fetch('/api/user/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword })
        });

        const result = await response.json();

         if (response.ok) {
          alert('Password has been reset successfully! You will be logged out.');
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
          
        } else {
          alert(result.error || 'Failed to reset password.');
        }
      } catch (err) {
        console.error('Password reset failed:', err);
        alert('An error occurred while resetting the password.');
      }
    });
  }
}

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
        const response = await fetch('/api/user/edit', {
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
