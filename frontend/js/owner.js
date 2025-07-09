function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showModal() {
    const modal = document.getElementById('myModal');
    modal.classList.remove('hidden');
}

function hideModal() {
    const modal = document.getElementById('myModal');
    modal.classList.add('hidden');
}

function showSection(id) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    document.getElementById(id).classList.add('active');
    document.querySelector(`[data-section="${id}"]`).classList.add('active');

    if (id === 'myRestaurants') {
        fetchRestaurants();
    } else if (id === 'reservations') {
        fetchReservations();
    } else if (id === 'reviews') {
        fetchReviews();
    }
}

function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;

    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
}

function exportReservationsToCSV() {
    const table = document.getElementById("reservationTable");
    let csv = [];
    const rows = table.querySelectorAll("tr");

    for (let row of rows) {
        const cols = row.querySelectorAll("th, td");
        let csvRow = [];
        for (let col of cols) {
            let text = col.textContent.replace(/"/g, '""');
            csvRow.push(`"${text}"`);
        }
        csv.push(csvRow.join(","));
    }

    const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reservations.csv";
    a.classList.add('hidden');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function fetchRestaurants() {
    csrfFetch('/api/owner/restaurants')
        .then(res => res.json())
        .then(data => {
            const tableBody = document.querySelector('#restaurantTable tbody');
            tableBody.textContent = '';

            data.forEach(store => {
                const row = document.createElement('tr');

                // Create cells with escaped content
                const cells = [
                    decodeHtmlEntities(store.storeName),
                    decodeHtmlEntities(store.address),
                    decodeHtmlEntities(store.postalCode),
                    decodeHtmlEntities(store.location),
                    decodeHtmlEntities(store.cuisine),
                    decodeHtmlEntities(store.priceRange),
                    store.totalCapacity?.toString() || '',
                    store.opening,
                    store.closing
                ];

                cells.forEach(cellContent => {
                    const td = document.createElement('td');
                    td.textContent = cellContent;
                    row.appendChild(td);
                });

                // Actions cell
                const statusTd = document.createElement('td');
                const status = store.status || 'pending';
                const statusBadge = document.createElement('span');

                switch(status) {
                    case 'approved':
                        statusBadge.className = 'badge bg-success';
                        statusBadge.textContent = 'Live';
                        break;
                    case 'pending':
                        statusBadge.className = 'badge bg-warning';
                        statusBadge.textContent = 'Under Review';
                        break;
                    case 'rejected':
                        statusBadge.className = 'badge bg-danger';
                        statusBadge.textContent = 'Rejected';
                        if (store.rejection_reason) {
                            statusBadge.title = `Reason: ${store.rejection_reason}`;
                        }
                        break;
                    default:
                        statusBadge.className = 'badge bg-secondary';
                        statusBadge.textContent = status;
                }

                statusTd.appendChild(statusBadge);
                row.appendChild(statusTd);

                // Actions cell
                const actionTd = document.createElement('td');
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-sm btn-primary';
                editBtn.textContent = 'Edit';
                editBtn.dataset.storeId = store.id || store.store_id;
                editBtn.dataset.storeData = JSON.stringify(store);

                // Only allow editing if approved
                if (status === 'approved') {
                    editBtn.addEventListener('click', (e) => {
                        const storeData = JSON.parse(e.target.dataset.storeData);
                        editRestaurant(storeData);
                    });
                } else {
                    editBtn.disabled = true;
                    editBtn.title = 'Can only edit approved restaurants';
                }

                actionTd.appendChild(editBtn);
                row.appendChild(actionTd);
                tableBody.appendChild(row);
            });
        })
        .catch(err => {
            console.error('Error loading restaurants:', err);
            showError('Failed to load restaurants');
        });
}

function editRestaurant(store) {
    console.log('Opening modal for:', store);

    document.getElementById('restaurantId').value = store.id || store.store_id;
    document.getElementById('storeName').value = decodeHtmlEntities(store.storeName);
    document.getElementById('address').value = decodeHtmlEntities(store.address);
    document.getElementById('postalCode').value = decodeHtmlEntities(store.postalCode);
    document.getElementById('location').value = decodeHtmlEntities(store.location);
    document.getElementById('cuisine').value = decodeHtmlEntities(store.cuisine);
    document.getElementById('priceRange').value = decodeHtmlEntities(store.priceRange);
    document.getElementById('totalCapacity').value = store.totalCapacity;
    document.getElementById('opening').value = store.opening;
    document.getElementById('closing').value = store.closing;

    document.getElementById('restaurantModalTitle').textContent = 'Edit Restaurant';
    document.getElementById('restaurantModalBtn').textContent = 'Update Restaurant';

    showModal();
}

function submitRestaurantForm() {
    const id = document.getElementById('restaurantId').value;
    const storeData = {
        storeName: document.getElementById('storeName').value.trim(),
        address: document.getElementById('address').value.trim(),
        postalCode: document.getElementById('postalCode').value.trim(),
        location: document.getElementById('location').value.trim(),
        cuisine: document.getElementById('cuisine').value.trim(),
        priceRange: document.getElementById('priceRange').value,
        totalCapacity: parseInt(document.getElementById('totalCapacity').value, 10),
        opening: document.getElementById('opening').value,
        closing: document.getElementById('closing').value
    };

    csrfFetch(`/api/owner/restaurants/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(storeData)
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(errorData => {
                throw new Error(JSON.stringify(errorData));
            });
        }
        return res.json();
    })
    .then(() => {
        closeModal();
        fetchRestaurants();
        showSuccessMessage('Restaurant updated successfully!');
    })
    .catch(err => {
        console.error('Error updating restaurant:', err);

        try {
            const errorData = JSON.parse(err.message);
            if (errorData.errors && errorData.errors.length > 0) {
                // Display specific validation errors
                const errorMessages = errorData.errors.map(error =>
                    `${error.path}: ${error.msg}`
                ).join('\n');
                showErrorMessage(`Validation failed:\n${errorMessages}`);
            } else {
                showErrorMessage('Failed to update restaurant. Please try again.');
            }
        } catch {
            showErrorMessage('Failed to update restaurant. Please try again.');
        }
    });
}
function showSuccessMessage(message) {
    // Create a temporary success alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insert at the top of the main content
    const mainContent = document.querySelector('main');
    mainContent.insertBefore(alert, mainContent.firstChild);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

function showErrorMessage(message) {
    // Create a temporary error alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Insert at the top of the main content
    const mainContent = document.querySelector('main');
    mainContent.insertBefore(alert, mainContent.firstChild);

    // Auto-remove after 8 seconds for errors
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 8000);
}
function closeModal() {
    hideModal();
    document.getElementById('restaurantId').value = '';
    document.getElementById('restaurantForm').reset();
    document.getElementById('restaurantModalTitle').textContent = 'Request New Restaurant';
    document.getElementById('restaurantModalBtn').textContent = 'Send Request';
}

function fetchReservations() {
    csrfFetch('/api/owner/reservations/me')
        .then(res => res.json())
        .then(data => {
            const tableBody = document.querySelector('#reservationTable tbody');
            tableBody.textContent = '';

            data.forEach(reservation => {
                const dateOnly = reservation.reservationDate.split('T')[0];
                const row = document.createElement('tr');

                const cells = [
                    escapeHtml(reservation.userName),
                    escapeHtml(reservation.first_name),
                    escapeHtml(reservation.last_name),
                    escapeHtml(reservation.storeName),
                    escapeHtml(dateOnly),
                    escapeHtml(reservation.reservationTime),
                    escapeHtml(reservation.noOfGuest?.toString()),
                ];

                cells.forEach(cellContent => {
                    const td = document.createElement('td');
                    td.textContent = cellContent;
                    row.appendChild(td);
                });

                // Status cell with action button
                const statusTd = document.createElement('td');
                if (reservation.status === 'Confirmed') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn btn-sm btn-warning';
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.addEventListener('click', () => {
                        cancelReservation(reservation.reservation_id);
                    });
                    statusTd.appendChild(cancelBtn);
                } else {
                    statusTd.textContent = escapeHtml(reservation.status);
                }
                row.appendChild(statusTd);

                // Special request cell (decoded only)
                const requestTd = document.createElement('td');
                requestTd.textContent = reservation.specialRequest || '';
                row.appendChild(requestTd);

                tableBody.appendChild(row);
            });
        })
        .catch(err => {
            console.error('Error loading reservations:', err);
            showError('Failed to load reservations');
        });
}

function cancelReservation(reservationId) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }

    csrfFetch(`/api/owner/reservations/${encodeURIComponent(reservationId)}/cancel`, {
        method: 'PUT'
    })
        .then(res => {
            if (!res.ok) throw new Error('Failed to cancel reservation');
            return res.json();
        })
        .then(() => {
            alert('Reservation cancelled!');
            fetchReservations();
        })
        .catch(err => {
            console.error('Error cancelling reservation:', err);
            alert('Failed to cancel reservation');
        });
}

function fetchReviews() {
    csrfFetch('/api/owner/reviews/me')
        .then(res => res.json())
        .then(data => {
            const tableBody = document.querySelector('#reviewTable tbody');
            tableBody.textContent = '';

            data.forEach(review => {
                const row = document.createElement('tr');

                const cells = [
                    escapeHtml(review.storeName),
                    escapeHtml(review.userName),
                    escapeHtml(review.rating?.toString()),
                    review.description // encoded it back cos it's not a good practice to decode; e.g. usage of InnerHTML will lead to XSS
                ];

                cells.forEach(cellContent => {
                    const td = document.createElement('td');
                    td.textContent = cellContent;
                    row.appendChild(td);
                });

                tableBody.appendChild(row);
            });
        })
        .catch(err => {
            console.error('Error loading reviews:', err);
            showError('Failed to load reviews');
        });
}

function showError(message) {
    console.error(message);
    showErrorMessage(message); // Use the new function instead of alert()
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

    // Export CSV button
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportReservationsToCSV);
    }

    // Modal close button
    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // Restaurant form submission
    const restaurantForm = document.getElementById('restaurantForm');
    if (restaurantForm) {
        restaurantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitRestaurantForm();
        });
    }

    // Close modal when clicking outside
    const modal = document.getElementById('myModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
}

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    showSection('myRestaurants');
});