function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('hidden');
}

// Pagination state management
const paginationState = {
    restaurants: { page: 1, limit: 10 },
    users: { page: 1, limit: 10 },
    reservations: { page: 1, limit: 10 },
    'pending-restaurants': { page: 1, limit: 10 },
    'pending-actions': { page: 1, limit: 10 }
};

function createPaginationControls(containerId, pagination, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear existing pagination
    let paginationDiv = container.querySelector('.pagination-controls');
    if (paginationDiv) {
        paginationDiv.remove();
    }

    if (pagination.totalPages <= 1) return;

    paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-controls d-flex justify-content-between align-items-center mt-3';

    // Info text
    const infoDiv = document.createElement('div');
    const start = ((pagination.page - 1) * pagination.limit) + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    const infoText = document.createElement('small');
    infoText.className = 'text-muted';
    infoText.textContent = `Showing ${start}-${end} of ${pagination.total} entries`;
    infoDiv.appendChild(infoText);

    // Pagination buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'btn-group';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = `btn btn-sm btn-outline-primary ${!pagination.hasPrev ? 'disabled' : ''}`;
    prevBtn.innerHTML = '&laquo; Previous';
    prevBtn.disabled = !pagination.hasPrev;
    if (pagination.hasPrev) {
        prevBtn.addEventListener('click', () => onPageChange(pagination.page - 1));
    }

    // Page numbers
    const pageNumbers = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, pagination.page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn btn-sm ${i === pagination.page ? 'btn-primary' : 'btn-outline-primary'}`;
        pageBtn.textContent = i;
        if (i !== pagination.page) {
            pageBtn.addEventListener('click', () => onPageChange(i));
        }
        pageNumbers.push(pageBtn);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = `btn btn-sm btn-outline-primary ${!pagination.hasNext ? 'disabled' : ''}`;
    nextBtn.innerHTML = 'Next &raquo;';
    nextBtn.disabled = !pagination.hasNext;
    if (pagination.hasNext) {
        nextBtn.addEventListener('click', () => onPageChange(pagination.page + 1));
    }

    // Assemble buttons
    buttonsDiv.appendChild(prevBtn);
    pageNumbers.forEach(btn => buttonsDiv.appendChild(btn));
    buttonsDiv.appendChild(nextBtn);

    paginationDiv.appendChild(infoDiv);
    paginationDiv.appendChild(buttonsDiv);
    container.appendChild(paginationDiv);
}

function showSection(id) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected section
    document.getElementById(id).classList.add('active');
    document.querySelector(`[data-section="${id}"]`).classList.add('active');

    // Reset pagination for new section
    if (paginationState[id]) {
        paginationState[id].page = 1;
    }

    // Load data for the section
    switch(id) {
        case 'dashboard':
            loadDashboardStats();
            break;
        case 'restaurants':
            loadRestaurants();
            break;
        case 'users':
            loadUsers();
            break;
        case 'reservations':
            loadReservations();
            break;
        case 'pending':
            loadPendingRestaurants();
            loadPendingActions();
            break;
    }
}

async function loadPendingRestaurants(page = 1) {
    try {
        paginationState['pending-restaurants'].page = page;
        const params = new URLSearchParams({
            page: page,
            limit: paginationState['pending-restaurants'].limit
        });

        const response = await fetch(`/api/admin/pending-restaurants?${params}`);
        const result = await response.json();

        const tbody = document.querySelector('#pending tbody');
        tbody.textContent = '';

        // Update badge count (show total, not just current page)
        const badge = document.getElementById('pendingCount');
        if (result.pagination.total > 0) {
            badge.textContent = result.pagination.total;
            badge.classList.remove('d-none');
            badge.classList.add('d-inline');
        } else {
            badge.classList.add('d-none');
            badge.classList.remove('d-inline');
        }

        if (result.data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center text-muted">No pending applications</td>';
            tbody.appendChild(row);
        } else {
            result.data.forEach(restaurant => {
                const row = document.createElement('tr');

                // Image cell
                const imageCell = document.createElement('td');
                const img = document.createElement('img');
                img.src = restaurant.imageUrl || '/static/img/restaurants/no-image.png';
                img.alt = 'Restaurant image';
                img.className = 'rounded';
                imageCell.appendChild(img);
                row.appendChild(imageCell);

                // Restaurant name
                const nameCell = document.createElement('td');
                const nameStrong = document.createElement('strong');
                nameStrong.textContent = restaurant.storeName;
                nameCell.appendChild(nameStrong);
                row.appendChild(nameCell);

                // Owner
                const ownerCell = document.createElement('td');
                ownerCell.textContent = `${restaurant.firstname} ${restaurant.lastname}`;
                row.appendChild(ownerCell);

                // Location
                const locationCell = document.createElement('td');
                locationCell.textContent = restaurant.location;
                row.appendChild(locationCell);

                // Cuisine
                const cuisineCell = document.createElement('td');
                const cuisineBadge = document.createElement('span');
                cuisineBadge.className = 'badge bg-secondary';
                cuisineBadge.textContent = restaurant.cuisine;
                cuisineCell.appendChild(cuisineBadge);
                row.appendChild(cuisineCell);

                // Submitted date
                const submittedCell = document.createElement('td');
                const submittedDate = new Date(restaurant.submitted_at);
                submittedCell.textContent = submittedDate.toLocaleDateString();
                submittedCell.title = submittedDate.toLocaleString();
                row.appendChild(submittedCell);

                // Actions
                const actionsCell = document.createElement('td');
                const reviewBtn = document.createElement('button');
                reviewBtn.className = 'btn btn-sm btn-primary me-1';
                reviewBtn.innerHTML = '<i class="bi bi-eye"></i> Review';
                reviewBtn.addEventListener('click', () => reviewRestaurant(restaurant));
                actionsCell.appendChild(reviewBtn);
                row.appendChild(actionsCell);

                tbody.appendChild(row);
            });
        }

        // Create pagination controls
        createPaginationControls('pendingRestaurantList', result.pagination, loadPendingRestaurants);

    } catch (error) {
        console.error('Error loading pending restaurants:', error);
        showError('Failed to load pending restaurants');
    }
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/admin/dashboard-stats');
        const data = await response.json();

        document.getElementById('totalUsers').textContent = data.totalUsers;
        document.getElementById('totalRestaurants').textContent = data.totalRestaurants;
        document.getElementById('totalReservations').textContent = data.totalReservations;
        document.getElementById('topReviewCount').textContent = data.topAverageRating;
        document.getElementById('topRestaurantName').textContent = data.topRatedRestaurant;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showError('Failed to load dashboard statistics');
    }
}

async function loadRestaurants(page = 1) {
    try {
        paginationState.restaurants.page = page;
        const params = new URLSearchParams({
            page: page,
            limit: paginationState.restaurants.limit
        });

        const response = await fetch(`/api/admin/restaurants?${params}`);
        const result = await response.json();

        const tbody = document.querySelector('#restaurants tbody');
        tbody.textContent = '';

        result.data.forEach(restaurant => {
            const row = document.createElement('tr');

            // Create cells with text truncation
            const nameCell = document.createElement('td');
            nameCell.className = 'text-truncate-cell';
            nameCell.textContent = restaurant.storeName;
            nameCell.title = restaurant.storeName;
            row.appendChild(nameCell);

            const locationCell = document.createElement('td');
            locationCell.className = 'text-truncate-cell';
            locationCell.textContent = restaurant.location;
            locationCell.title = restaurant.location;
            row.appendChild(locationCell);

            const ownerCell = document.createElement('td');
            ownerCell.className = 'text-truncate-cell';
            ownerCell.textContent = restaurant.ownerName;
            ownerCell.title = restaurant.ownerName;
            row.appendChild(ownerCell);

            // Actions cell
            const actionsCell = document.createElement('td');
            actionsCell.className = 'col-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm btn-warning me-1';
            editBtn.textContent = 'Edit';
            editBtn.dataset.id = restaurant.store_id;
            editBtn.addEventListener('click', () => editRestaurant(restaurant.store_id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => deleteRestaurant(restaurant.store_id));

            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(deleteBtn);
            row.appendChild(actionsCell);

            tbody.appendChild(row);
        });

        // Create pagination controls
        createPaginationControls('restaurantList', result.pagination, loadRestaurants);

    } catch (error) {
        console.error('Error loading restaurants:', error);
        showError('Failed to load restaurants');
    }
}

async function loadUsers(page = 1) {
    try {
        paginationState.users.page = page;
        const params = new URLSearchParams({
            page: page,
            limit: paginationState.users.limit
        });

        const response = await fetch(`/api/admin/users?${params}`);
        const result = await response.json();

        const tbody = document.querySelector('#users tbody');
        tbody.textContent = '';

        result.data.forEach(user => {
            const row = document.createElement('tr');

            // Create cells with proper classes and truncation
            const nameCell = document.createElement('td');
            nameCell.className = 'text-truncate-cell';
            nameCell.textContent = user.name; // textContent already escapes HTML
            nameCell.title = user.name;
            row.appendChild(nameCell);

            const firstNameCell = document.createElement('td');
            firstNameCell.className = 'text-truncate-cell';
            firstNameCell.textContent = user.firstname;
            firstNameCell.title = user.firstname;
            row.appendChild(firstNameCell);

            const lastNameCell = document.createElement('td');
            lastNameCell.className = 'text-truncate-cell';
            lastNameCell.textContent = user.lastname;
            lastNameCell.title = user.lastname;
            row.appendChild(lastNameCell);

            const emailCell = document.createElement('td');
            emailCell.className = 'text-truncate-cell';
            emailCell.textContent = user.email;
            emailCell.title = user.email;
            row.appendChild(emailCell);

            const roleCell = document.createElement('td');
            roleCell.textContent = user.role;
            row.appendChild(roleCell);

            // Actions cell with fixed width
            const actionsCell = document.createElement('td');
            actionsCell.className = 'col-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm btn-warning me-1';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => editUser(user.user_id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger me-1';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => deleteUser(user.user_id));

            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-sm btn-info me-1';
            resetBtn.textContent = 'Reset';
            resetBtn.addEventListener('click', () => resetUserPassword(user.user_id));

            const logoutBtn = document.createElement('button');
            logoutBtn.className = 'btn btn-sm btn-secondary';
            logoutBtn.textContent = 'Kick';
            logoutBtn.addEventListener('click', () => terminateSession(user.user_id));

            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(deleteBtn);
            actionsCell.appendChild(resetBtn);
            actionsCell.appendChild(logoutBtn);
            row.appendChild(actionsCell);

            tbody.appendChild(row);
        });

        // Create pagination controls
        createPaginationControls('userList', result.pagination, loadUsers);

    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users');
    }
}

async function loadReservations(page = 1) {
    try {
        paginationState.reservations.page = page;
        const params = new URLSearchParams({
            page: page,
            limit: paginationState.reservations.limit
        });

        const response = await fetch(`/api/admin/reservations?${params}`);
        const result = await response.json();

        const tbody = document.querySelector('#reservations tbody');
        tbody.textContent = '';

        result.data.forEach(reservation => {
            const row = document.createElement('tr');

            // User name
            const userCell = document.createElement('td');
            userCell.className = 'text-truncate-cell';
            userCell.textContent = reservation.userName;
            userCell.title = reservation.userName;
            row.appendChild(userCell);

            // Restaurant name
            const restaurantCell = document.createElement('td');
            restaurantCell.className = 'text-truncate-cell';
            restaurantCell.textContent = reservation.restaurantName;
            restaurantCell.title = reservation.restaurantName;
            row.appendChild(restaurantCell);

            // Number of guests
            const guestCell = document.createElement('td');
            guestCell.textContent = reservation.noOfGuest?.toString() || '';
            row.appendChild(guestCell);

            // Date
            const dateCell = document.createElement('td');
            dateCell.textContent = new Date(reservation.reservationDate).toLocaleDateString();
            row.appendChild(dateCell);

            // Time
            const timeCell = document.createElement('td');
            timeCell.textContent = reservation.reservationTime;
            row.appendChild(timeCell);

            // Status
            const statusCell = document.createElement('td');
            statusCell.textContent = reservation.status;
            row.appendChild(statusCell);

            // Special request with special handling for long text
            const requestCell = document.createElement('td');
            if (reservation.specialRequest && reservation.specialRequest.trim()) {
                const requestSpan = document.createElement('span');
                requestSpan.className = 'special-request-text';
                requestSpan.textContent = reservation.specialRequest;
                requestSpan.title = reservation.specialRequest;
                requestCell.appendChild(requestSpan);
            } else {
                requestCell.textContent = '-';
            }
            row.appendChild(requestCell);

            // Actions cell
            const actionsCell = document.createElement('td');
            actionsCell.className = 'col-actions';

            if (reservation.status === 'Confirmed') {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn btn-sm btn-danger';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', () => cancelReservation(reservation.reservation_id));
                actionsCell.appendChild(cancelBtn);
            } else {
                actionsCell.textContent = '-';
            }

            row.appendChild(actionsCell);
            tbody.appendChild(row);
        });

        // Create pagination controls
        createPaginationControls('reservationList', result.pagination, loadReservations);

    } catch (error) {
        console.error('Error loading reservations:', error);
        showError('Failed to load reservations');
    }
}

async function loadOwners() {
    try {
        const response = await fetch('/api/admin/owners');
        const owners = await response.json();

        const select = document.getElementById('ownerSelect');
        select.innerHTML = '<option value="">Select Owner</option>';

        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner.user_id;
            option.textContent = escapeHtml(owner.name);
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading owners:', error);
        showError('Failed to load owners');
    }
}

function reviewRestaurant(restaurant) {
    // Populate modal with restaurant details
    document.getElementById('reviewStoreName').textContent = restaurant.storeName;
    document.getElementById('reviewAddress').textContent = restaurant.address;
    document.getElementById('reviewPostalCode').textContent = restaurant.postalCode;
    document.getElementById('reviewLocation').textContent = restaurant.location;
    document.getElementById('reviewCuisine').textContent = restaurant.cuisine;
    document.getElementById('reviewPriceRange').textContent = restaurant.priceRange;
    document.getElementById('reviewCapacity').textContent = restaurant.totalCapacity;
    document.getElementById('reviewHours').textContent = `${restaurant.opening} - ${restaurant.closing}`;

    document.getElementById('reviewOwnerName').textContent = `${restaurant.firstname} ${restaurant.lastname}`;
    document.getElementById('reviewOwnerEmail').textContent = restaurant.owner_email;
    document.getElementById('reviewSubmitted').textContent = new Date(restaurant.submitted_at).toLocaleString();

    const img = document.getElementById('reviewImage');
    img.src = restaurant.imageUrl || '/static/img/restaurants/no-image.png';
    img.alt = `${restaurant.storeName} image`;

    const approveBtn = document.getElementById('approveBtn');
    // Remove any existing listeners first
    approveBtn.replaceWith(approveBtn.cloneNode(true));
    document.getElementById('approveBtn').addEventListener('click', () => approveRestaurant(restaurant.store_id));

    const rejectBtn = document.getElementById('rejectBtn');
    rejectBtn.replaceWith(rejectBtn.cloneNode(true));
    document.getElementById('rejectBtn').addEventListener('click', () => showRejectSection());

    const cancelBtn = document.getElementById('cancelReviewBtn');
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    document.getElementById('cancelReviewBtn').addEventListener('click', closeReviewModal);

    // Store restaurant ID for later use
    document.getElementById('reviewModal').dataset.restaurantId = restaurant.store_id;

    // Store restaurant ID for rejection
    document.getElementById('reviewModal').dataset.restaurantId = restaurant.store_id;

    // Reset rejection section
    const rej = document.getElementById('rejectionSection');
    rej.classList.add('hidden');
    rej.classList.remove('visible-block');

    document.getElementById('rejectionReason').value = '';

    showModal('reviewModal');
}

function showRejectSection() {
    const rej = document.getElementById('rejectionSection');

    // Reveal it
    rej.classList.remove('hidden');
    rej.classList.add('visible-block');

    // Focus the textarea
    document.getElementById('rejectionReason').focus();

    // Wire up the actual rejection handler
    const rejectBtn = document.getElementById('rejectBtn');
    rejectBtn.replaceWith(rejectBtn.cloneNode(true));
    document.getElementById('rejectBtn').addEventListener('click', () => {
        const reason = document.getElementById('rejectionReason').value.trim();
        if (reason.length < 10) {
            alert('Please provide a detailed rejection reason (at least 10 characters)');
            return;
        }
        const restaurantId = document.getElementById('reviewModal').dataset.restaurantId;
        void rejectRestaurant(restaurantId, reason);
    });

    document.getElementById('rejectBtn').innerHTML = '<i class="bi bi-x-circle"></i> Confirm Rejection';
}

async function approveRestaurant(restaurantId) {
    if (!confirm('Are you sure you want to approve this restaurant?')) return;

    try {
        const response = await callSensitiveJson(`/api/admin/approve-restaurant/${restaurantId}`, 'POST');

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to approve restaurant');
        }

        const result = await response.json();
        alert(result.message);
        closeReviewModal();
        loadPendingRestaurants(paginationState['pending-restaurants'].page);

    } catch (error) {
        console.error('Error approving restaurant:', error);
        alert(error.message);
    }
}

async function rejectRestaurant(restaurantId, reason) {
    try {
        const response = await callSensitiveJson(
            `/api/admin/reject-restaurant/${restaurantId}`,
            'POST',
            { rejection_reason: reason }
        );

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Failed to reject restaurant');
        }

        const result = await response.json();
        alert(result.message);
        closeReviewModal();
        loadPendingRestaurants(paginationState['pending-restaurants'].page);
    } catch (error) {
        console.error('Error rejecting restaurant:', error);
        alert(error.message);
    }
}

function closeReviewModal() {
    hideModal('reviewModal');
}

function openModal() {
    loadOwners();
    resetRestaurantForm();
    document.getElementById('restaurantModalTitle').textContent = 'Add New Restaurant';
    document.getElementById('restaurantModalBtn').textContent = 'Add Restaurant';
    showModal('myModal');
}

function openUserModal() {
    resetUserForm();
    document.getElementById('userModalTitle').textContent = 'Add New User';
    document.getElementById('userModalBtn').textContent = 'Add User';
    showModal('userModal');
}

function closeModal() {
    hideModal('myModal');
    resetRestaurantForm();
}

function closeUserModal() {
    hideModal('userModal');
    resetUserForm();
}

function resetRestaurantForm() {
    document.getElementById('restaurantForm').reset();
    document.getElementById('restaurantId').value = '';
}

function resetUserForm() {
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
}

async function submitRestaurantForm() {
  const form = document.getElementById('restaurantForm');
  const formData = new FormData(form);
  const restaurantId = document.getElementById('restaurantId').value;

  // Add owner_id to formData
  formData.append('owner_id', document.getElementById('ownerSelect').value);

  try {
    const url = restaurantId
      ? `/api/admin/restaurants/${restaurantId}`
      : '/api/admin/restaurants';
    const method = restaurantId ? 'PUT' : 'POST';

    const response = await callSensitiveJson(url, method, formData, true);

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.message || 'Failed to save restaurant');
    }

    alert(result.message || 'Restaurant saved successfully!');
    closeModal();
    loadRestaurants(paginationState.restaurants.page);
  } catch (error) {
    console.error('Error saving restaurant:', error);
    alert(`Failed to save restaurant: ${error.message}`);
  }
}

async function submitUserForm() {
    const form = document.getElementById('userForm');
    const formData = new FormData(form);
    const userId = document.getElementById('userId').value;

    const userData = {
        name: formData.get('name'),
        firstname: formData.get('firstname'),
        lastname: formData.get('lastname'),
        email: formData.get('email'),
        role: formData.get('role'),
        fname: formData.get('firstname'),
        lname: formData.get('lastname')
    };

    const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
    const method = userId ? 'PUT' : 'POST';

    try {
        const response = await callSensitiveJson(url, method, userData);
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || 'Failed to save user');
        }

        const result = await response.json();
        alert(result.message || 'User saved successfully!');
        closeUserModal();
        loadUsers(paginationState.users.page);
    } catch (error) {
        console.error('Error saving user:', error);
        alert(`Failed to save user: ${error.message}`);
    }
}

async function editRestaurant(id) {
    try {
        const response = await fetch(`/api/admin/restaurants/${id}`);
        const restaurant = await response.json();

        // Load owners first
        await loadOwners();

        // Populate form
        document.getElementById('restaurantId').value = restaurant.store_id;
        document.getElementById('storeName').value = restaurant.storeName;
        document.getElementById('ownerSelect').value = restaurant.owner_id;
        document.getElementById('address').value = restaurant.address;
        document.getElementById('postalCode').value = restaurant.postalCode;
        document.getElementById('cuisine').value = restaurant.cuisine;
        document.getElementById('location').value = restaurant.location;
        document.getElementById('priceRange').value = restaurant.priceRange;
        document.getElementById('totalCapacity').value = restaurant.totalCapacity;
        document.getElementById('opening').value = restaurant.opening;
        document.getElementById('closing').value = restaurant.closing;

        document.getElementById('restaurantModalTitle').textContent = 'Edit Restaurant';
        document.getElementById('restaurantModalBtn').textContent = 'Update Restaurant';
        showModal('myModal');
    } catch (error) {
        console.error('Error loading restaurant for edit:', error);
        alert('Failed to load restaurant details');
    }
}

async function editUser(id) {
    try {
        const response = await fetch(`/api/admin/users/${id}`);
        const user = await response.json();

        // Populate form
        document.getElementById('userId').value = user.user_id;
        document.getElementById('name').value = user.name;
        document.getElementById('firstname').value = user.firstname;
        document.getElementById('lastname').value = user.lastname;
        document.getElementById('email').value = user.email;
        document.getElementById('role').value = user.role;

        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('userModalBtn').textContent = 'Update User';
        showModal('userModal');
    } catch (error) {
        console.error('Error loading user for edit:', error);
        alert('Failed to load user details');
    }
}

async function deleteRestaurant(id) {
    if (!confirm('Are you sure you want to delete this restaurant? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await window.csrfFetch(`/api/admin/restaurants/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete restaurant');
        }

        const result = await response.json();
        alert(result.message || 'Restaurant deleted successfully!');
        loadRestaurants(paginationState.restaurants.page);
    } catch (error) {
        console.error('Error deleting restaurant:', error);
        alert('Failed to delete restaurant');
    }
}

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user? This will also delete all their reservations and reviews.')) {
        return;
    }

    try {
        const response = await window.csrfFetch(`/api/admin/users/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete user');
        }

        const result = await response.json();
        alert(result.message || 'User deleted successfully!');
        loadUsers(paginationState.users.page);
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user');
    }
}

async function resetUserPassword(id) {
    if (!confirm('Send password reset email to this user? This may require multi-admin approval.')) {
        return;
    }

    try {
        // Step 1: Trigger the reset-password logic
        const res = await window.csrfFetch(`/api/admin/users/${id}/reset-password`, {
            method: 'POST'
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'Failed to initiate password reset.');
            showSection('pending');
            return;
        }

        // Step 2: If password has been reset (i.e. multi-admin approval met)
        if (data.message?.includes('reset to default')) {
            // Now send the email
            const emailRes = await window.csrfFetch()(`/api/admin/users/${id}/send-reset-email`, {
                method: 'POST'
            });

            const emailData = await emailRes.json();

            if (emailRes.ok) {
                alert(emailData.message || 'Password reset email sent!');
            } else {
                alert(emailData.error || 'Password was reset, but failed to send email.');
            }

        } else {
            // Not yet approved → inform the admin
            alert(data.message || 'Password reset request created. Waiting for 2 admin approvals.');
        }

        showSection('pending');

    } catch (err) {
        console.error('Error in password reset flow:', err);
        alert('Unexpected error occurred.');
        showSection('pending');
    }
}

async function cancelReservation(id) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }

    try {
        // Ensure ID is properly formatted as number/string without HTML encoding
        const reservationId = String(id).replace(/[^0-9]/g, ''); // Only allow numbers

        console.log('Cancelling reservation with ID:', reservationId); // Debug log

        const response = await window.csrfFetch(`/api/admin/reservations/${reservationId}/cancel`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to cancel reservation');
        }

        const result = await response.json();
        alert(result.message || 'Reservation cancelled successfully!');
        loadReservations(paginationState.reservations.page);
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        alert(`Failed to cancel reservation: ${error.message}`);
    }
}

function showError(message) {
    console.error(message);
    alert(message);
}

// Load pending sensitive admin actions
async function loadPendingActions(page = 1) {
  try {
    paginationState['pending-actions'].page = page;
    const params = new URLSearchParams({
        page: page,
        limit: paginationState['pending-actions'].limit
    });

    const res = await fetch(`/api/admin/pending-actions?${params}`);
    if (!res.ok) throw new Error('Failed to fetch pending actions');
    const result = await res.json();

    const tbody = document.querySelector('#pendingActionList tbody');
    tbody.innerHTML = '';

    if (result.data.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" class="text-center text-muted">No pending actions</td>';
        tbody.appendChild(row);
    } else {
        result.data.forEach(action => {
          const tr = document.createElement('tr');

          // Action type
          const actionCell = document.createElement('td');
          actionCell.textContent = action.action_type;
          tr.appendChild(actionCell);

          // Target with truncation
          const targetCell = document.createElement('td');
          targetCell.className = 'text-truncate-cell';
          const targetText = `${action.target_id} - ${action.target_name || 'Unknown'}`;
          targetCell.textContent = targetText;
          targetCell.title = targetText;
          tr.appendChild(targetCell);

          // Target type
          const typeCell = document.createElement('td');
          typeCell.textContent = action.target_type;
          tr.appendChild(typeCell);

          // Requested by with truncation
          const requestedCell = document.createElement('td');
          requestedCell.className = 'text-truncate-cell';
          const requestedText = `${action.requested_by} - ${action.requested_by_name || 'Unknown'}`;
          requestedCell.textContent = requestedText;
          requestedCell.title = requestedText;
          tr.appendChild(requestedCell);

          // Approvals count
          const approvalsCell = document.createElement('td');
          approvalsCell.textContent = (action.approved_by || []).length;
          tr.appendChild(approvalsCell);

          // Rejections count
          const rejectionsCell = document.createElement('td');
          rejectionsCell.textContent = (action.rejected_by || []).length;
          tr.appendChild(rejectionsCell);

          // Decision buttons
          const decisionCell = document.createElement('td');
          decisionCell.className = 'col-actions';

          if (action.status === 'pending') {
            const approveBtn = document.createElement('button');
            approveBtn.className = 'btn btn-sm btn-success me-1';
            approveBtn.innerHTML = '<i class="bi bi-check-circle"></i>';
            approveBtn.title = 'Approve';
            approveBtn.addEventListener('click', () => approveAction(action));

            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'btn btn-sm btn-danger';
            rejectBtn.innerHTML = '<i class="bi bi-x-circle"></i>';
            rejectBtn.title = 'Reject';
            rejectBtn.addEventListener('click', () => rejectAction(action));

            decisionCell.appendChild(approveBtn);
            decisionCell.appendChild(rejectBtn);
          } else {
            decisionCell.textContent = action.status;
          }

          tr.appendChild(decisionCell);
          tbody.appendChild(tr);
        });
    }

    // Create pagination controls
    createPaginationControls('pendingActionList', result.pagination, loadPendingActions);

  } catch (err) {
    console.error('Error loading pending admin actions:', err);
    alert('Failed to load pending actions.');
  }
}

async function approveAction(action) {
  try {
    const endpoint = action.action_type === 'delete_user'
      ? `/api/admin/users/${action.target_id}`
      : action.action_type === 'delete_restaurant'
        ? `/api/admin/restaurants/${action.target_id}`
        : action.action_type === 'reset_password'
          ? `/api/admin/users/${action.target_id}/reset-password`
          : null;

    if (!endpoint) throw new Error('Unsupported action type');

    const res = await window.csrfFetch(endpoint, {
      method: action.action_type === 'reset_password' ? 'POST' : 'DELETE'
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      loadPendingActions(paginationState['pending-actions'].page);
    } else {
      alert(data.error || data.message || 'Failed to approve');
    }
  } catch (err) {
    console.error('Approval failed:', err);
    alert('Failed to approve action');
  }
}

async function rejectAction(action) {
  try {
    const endpoint = action.action_type === 'delete_user'
      ? `/api/admin/users/${action.target_id}?decision=reject`
      : action.action_type === 'delete_restaurant'
        ? `/api/admin/restaurants/${action.target_id}?decision=reject`
        : action.action_type === 'reset_password'
          ? `/api/admin/users/${action.target_id}/reset-password?decision=reject`
          : null;

    if (!endpoint) throw new Error('Unsupported action type');

    const res = await window.csrfFetch(endpoint, {
      method: action.action_type === 'reset_password' ? 'POST' : 'DELETE'
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      loadPendingActions(paginationState['pending-actions'].page);
    } else {
      alert(data.error || data.message || 'Failed to reject');
    }
  } catch (err) {
    console.error('Rejection failed:', err);
    alert('Failed to reject action');
  }
}

function setupEventListeners() {
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.closest('[data-section]').dataset.section;
            showSection(section);
        });
    });

    // Modal buttons
    const addRestaurantBtn = document.getElementById('addRestaurantBtn');
    if (addRestaurantBtn) {
        addRestaurantBtn.addEventListener('click', openModal);
    }

    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', openUserModal);
    }

    // Close modal buttons
    const closeRestaurantModalBtn = document.getElementById('closeRestaurantModalBtn');
    if (closeRestaurantModalBtn) {
        closeRestaurantModalBtn.addEventListener('click', closeModal);
    }

    const closeUserModalBtn = document.getElementById('closeUserModalBtn');
    if (closeUserModalBtn) {
        closeUserModalBtn.addEventListener('click', closeUserModal);
    }

    // Form submissions
    const restaurantForm = document.getElementById('restaurantForm');
    if (restaurantForm) {
        restaurantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitRestaurantForm();
        });
    }

    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitUserForm();
        });
    }

    // Close modals when clicking outside
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.id === 'myModal') {
                    closeModal();
                } else if (modal.id === 'userModal') {
                    closeUserModal();
                }
            }
        });
    });
    const closeReviewModalBtn = document.getElementById('closeReviewModalBtn');
    if (closeReviewModalBtn) {
        closeReviewModalBtn.addEventListener('click', closeReviewModal);
    }

    // Close review modal when clicking outside
    const reviewModal = document.getElementById('reviewModal');
    if (reviewModal) {
        reviewModal.addEventListener('click', (e) => {
            if (e.target === reviewModal) {
                closeReviewModal();
            }
        });
    }
    document.getElementById('closeReauthModalBtn').addEventListener('click', closeReauthModal);
}

async function callSensitiveJson(url, method = 'POST', body = null, isFormData = false) {
    let headers = {};
    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }

    // Add CSRF token for non-GET requests
    if (method.toUpperCase() !== 'GET') {
        const csrfToken = window.CSRFUtils?.getCSRFToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }
    }
    const fetchOptions = {
        method,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
        credentials: 'same-origin'
    };

    if (Object.keys(headers).length > 0) {
        fetchOptions.headers = headers;
    }

    let response = await fetch(url, fetchOptions);
    if (response.status === 401) {
        return new Promise((resolve, reject) => {
            showReauthModal(async () => {
                try {
                    // Retry with fresh CSRF token
                    const retryHeaders = {};

                    if (!isFormData) {
                        retryHeaders['Content-Type'] = 'application/json';
                    }

                    if (method.toUpperCase() !== 'GET') {
                        const freshCsrfToken = window.CSRFUtils?.getCSRFToken();
                        if (freshCsrfToken) {
                            retryHeaders['X-CSRF-Token'] = freshCsrfToken;
                        }
                    }

                    const retryOptions = {
                        method,
                        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
                        credentials: 'same-origin'
                    };

                    if (Object.keys(retryHeaders).length > 0) {
                        retryOptions.headers = retryHeaders;
                    }

                    const retryResponse = await fetch(url, retryOptions);
                    resolve(retryResponse);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }
    return response;
}

let reauthCallback = null;

function showReauthModal(callback) {
  reauthCallback = callback;
  document.getElementById('reauthPassword').value = '';
  document.getElementById('reauthModal').classList.remove('hidden');
  document.getElementById('reauthPassword').focus();
}

function closeReauthModal() {
  document.getElementById('reauthModal').classList.add('hidden');
  reauthCallback = null;
}

document.getElementById('reauthForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('reauthPassword').value;

  try {
    const res = await window.csrfFetch('/api/admin/reauthenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      alert('Incorrect password.');
      return;
    }

    closeReauthModal();
    if (reauthCallback) reauthCallback();

  } catch (err) {
    console.error('Reauth failed:', err);
    alert('Reauthentication failed');
  }
});

async function terminateSession(userId) {
  if (!confirm("Force logout this user? This will invalidate their session immediately.")) return;

  try {
    const res = await window.csrfFetch(`/api/admin/users/${userId}/force-logout`, {
      method: 'POST'
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.message || 'Failed to logout user');
    }

    alert(data.message || 'User session terminated successfully.');
  } catch (err) {
    console.error('Force logout failed:', err);
    alert('Error terminating session.');
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    showSection('dashboard');
    loadPendingRestaurants();
    loadPendingActions();
});