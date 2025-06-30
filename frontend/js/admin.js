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
            break;
    }
}
async function loadPendingRestaurants() {
    try {
        const response = await fetch('/api/admin/pending-restaurants');
        const pendingRestaurants = await response.json();

        const tbody = document.querySelector('#pending tbody');
        tbody.textContent = '';

        // Update badge count
        const badge = document.getElementById('pendingCount');
        if (pendingRestaurants.length > 0) {
            badge.textContent = pendingRestaurants.length;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }

        if (pendingRestaurants.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="text-center text-muted">No pending applications</td>';
            tbody.appendChild(row);
            return;
        }

        pendingRestaurants.forEach(restaurant => {
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
            nameStrong.textContent = restaurant.storeName;  // textContent auto-escapes
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
            cuisineBadge.textContent = restaurant.cuisine;  // textContent auto-escapes
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

async function loadRestaurants() {
    try {
        const response = await fetch('/api/admin/restaurants');
        const restaurants = await response.json();
        
        const tbody = document.querySelector('#restaurants tbody');
        tbody.textContent = '';

        restaurants.forEach(restaurant => {
            const row = document.createElement('tr');
            
            // Create cells with escaped content
            const nameCell = document.createElement('td');
            nameCell.textContent = restaurant.storeName;
            row.appendChild(nameCell);
            
            const locationCell = document.createElement('td');
            locationCell.textContent = restaurant.location;
            row.appendChild(locationCell);
            
            const ownerCell = document.createElement('td');
            ownerCell.textContent = restaurant.ownerName;
            row.appendChild(ownerCell);
            
            // Actions cell
            const actionsCell = document.createElement('td');
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm btn-warning me-2';
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
    } catch (error) {
        console.error('Error loading restaurants:', error);
        showError('Failed to load restaurants');
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const users = await response.json();
        
        const tbody = document.querySelector('#users tbody');
        tbody.textContent = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            
            const cells = [
                user.name,
                user.firstname,
                user.lastname,
                user.email,
                user.role
            ];

            cells.forEach(cellContent => {
                const td = document.createElement('td');
                td.textContent = escapeHtml(cellContent);
                row.appendChild(td);
            });
            
            // Actions cell
            const actionsCell = document.createElement('td');
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm btn-warning me-2';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => editUser(user.user_id));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger me-2';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => deleteUser(user.user_id));
            
            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-sm btn-info';
            resetBtn.textContent = 'Reset Pass';
            resetBtn.addEventListener('click', () => resetUserPassword(user.user_id));
            
            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(deleteBtn);
            actionsCell.appendChild(resetBtn);
            row.appendChild(actionsCell);
            
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users');
    }
}

async function loadReservations() {
    try {
        const response = await fetch('/api/admin/reservations');
        const reservations = await response.json();
        
        const tbody = document.querySelector('#reservations tbody');
        tbody.textContent = '';

        reservations.forEach(reservation => {
            const row = document.createElement('tr');
            
            const cells = [
                reservation.userName,
                reservation.restaurantName,
                reservation.noOfGuest?.toString(),
                new Date(reservation.reservationDate).toLocaleDateString(),
                reservation.reservationTime,
                reservation.status,
                reservation.specialRequest || ''
            ];

            cells.forEach(cellContent => {
                const td = document.createElement('td');
                td.textContent = escapeHtml(cellContent);
                row.appendChild(td);
            });
            
            // Actions cell
            const actionsCell = document.createElement('td');
            
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

    // Setup action buttons
    document.getElementById('approveBtn').onclick = () => approveRestaurant(restaurant.store_id);
    document.getElementById('rejectBtn').onclick = () => showRejectSection();
    document.getElementById('cancelReviewBtn').onclick = closeReviewModal;

    // Store restaurant ID for rejection
    document.getElementById('reviewModal').dataset.restaurantId = restaurant.store_id;

    // Reset rejection section
    const rej = document.getElementById('rejectionSection');
    rej.classList.add('hidden');
    rej.classList.remove('visible-block');

    document.getElementById('rejectionReason').value = '';

    showModal('reviewModal');
}

function reviewRestaurant(restaurant) {
    // Populate modal with restaurant details
    document.getElementById('reviewStoreName').textContent   = restaurant.storeName;
    document.getElementById('reviewAddress').textContent     = restaurant.address;
    document.getElementById('reviewPostalCode').textContent  = restaurant.postalCode;
    document.getElementById('reviewLocation').textContent    = restaurant.location;
    document.getElementById('reviewCuisine').textContent     = restaurant.cuisine;
    document.getElementById('reviewPriceRange').textContent  = restaurant.priceRange;
    document.getElementById('reviewCapacity').textContent    = restaurant.totalCapacity;
    document.getElementById('reviewHours').textContent       = `${restaurant.opening} - ${restaurant.closing}`;

    document.getElementById('reviewOwnerName').textContent   = `${restaurant.firstname} ${restaurant.lastname}`;
    document.getElementById('reviewOwnerEmail').textContent  = restaurant.owner_email;
    document.getElementById('reviewSubmitted').textContent   = new Date(restaurant.submitted_at).toLocaleString();

    const img = document.getElementById('reviewImage');
    img.src = restaurant.imageUrl || '/static/img/restaurants/no-image.png';
    img.alt = `${restaurant.storeName} image`;

    // Setup action buttons
    document.getElementById('approveBtn').onclick      = () => approveRestaurant(restaurant.store_id);
    document.getElementById('rejectBtn').onclick       = () => showRejectSection();
    document.getElementById('cancelReviewBtn').onclick = closeReviewModal;

    // Store restaurant ID for rejection
    document.getElementById('reviewModal').dataset.restaurantId = restaurant.store_id;

    // Reset (hide) rejection section via CSS classes
    const rej = document.getElementById('rejectionSection');
    rej.classList.add('hidden');
    rej.classList.remove('visible-block');

    // Clear textarea
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
    document.getElementById('rejectBtn').onclick = () => {
        const reason = document.getElementById('rejectionReason').value.trim();
        if (reason.length < 10) {
            alert('Please provide a detailed rejection reason (at least 10 characters)');
            return;
        }
        const restaurantId = document.getElementById('reviewModal').dataset.restaurantId;
        rejectRestaurant(restaurantId, reason);
    };

    document.getElementById('rejectBtn').innerHTML = '<i class="bi bi-x-circle"></i> Confirm Rejection';
}

async function approveRestaurant(restaurantId) {
    if (!confirm('Are you sure you want to approve this restaurant? It will go live immediately.')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/approve-restaurant/${restaurantId}`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to approve restaurant');
        }

        const result = await response.json();
        alert('Restaurant approved successfully! The owner has been notified.');
        closeReviewModal();
        loadPendingRestaurants();
    } catch (error) {
        console.error('Error approving restaurant:', error);
        alert('Failed to approve restaurant');
    }
}

async function rejectRestaurant(restaurantId, reason) {
    try {
        const response = await fetch(`/api/admin/reject-restaurant/${restaurantId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rejection_reason: reason })
        });

        if (!response.ok) {
            throw new Error('Failed to reject restaurant');
        }

        const result = await response.json();
        alert('Restaurant rejected. The owner has been notified with the feedback.');
        closeReviewModal();
        loadPendingRestaurants();
    } catch (error) {
        console.error('Error rejecting restaurant:', error);
        alert('Failed to reject restaurant');
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
        const url = restaurantId ? `/api/admin/restaurants/${restaurantId}` : '/api/admin/restaurants';
        const method = restaurantId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to save restaurant');
        }
        
        const result = await response.json();
        alert(result.message || 'Restaurant saved successfully!');
        closeModal();
        loadRestaurants();
    } catch (error) {
        console.error('Error saving restaurant:', error);
        alert('Failed to save restaurant');
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
        fname: formData.get('firstname'), // Backend expects fname
        lname: formData.get('lastname')   // Backend expects lname
    };
    
    try {
        const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
        const method = userId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save user');
        }
        
        const result = await response.json();
        alert(result.message || 'User saved successfully!');
        closeUserModal();
        loadUsers();
    } catch (error) {
        console.error('Error saving user:', error);
        alert('Failed to save user');
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
        const response = await fetch(`/api/admin/restaurants/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete restaurant');
        }
        
        const result = await response.json();
        alert(result.message || 'Restaurant deleted successfully!');
        loadRestaurants();
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
        const response = await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        
        const result = await response.json();
        alert(result.message || 'User deleted successfully!');
        loadUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user');
    }
}

async function resetUserPassword(id) {
    if (!confirm('Reset user password to default (Pass123)?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${id}/reset-password`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Failed to reset password');
        }
        
        const result = await response.json();
        alert(result.message || 'Password reset successfully!');
    } catch (error) {
        console.error('Error resetting password:', error);
        alert('Failed to reset password');
    }
}

async function cancelReservation(id) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/reservations/${id}/cancel`, {
            method: 'PUT'
        });
        
        if (!response.ok) {
            throw new Error('Failed to cancel reservation');
        }
        
        const result = await response.json();
        alert(result.message || 'Reservation cancelled successfully!');
        loadReservations();
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        alert('Failed to cancel reservation');
    }
}

function showError(message) {
    console.error(message);
    alert(message); // You might want to replace this with a more elegant error display
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
}
// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    showSection('dashboard');
    loadPendingRestaurants();
});