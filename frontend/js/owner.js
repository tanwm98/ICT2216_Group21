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
    fetch('/api/owner/restaurants')
        .then(res => res.json())
        .then(data => {
            const tableBody = document.querySelector('#restaurantTable tbody');
            tableBody.textContent = '';

            data.forEach(store => {
                const row = document.createElement('tr');
                
                // Create cells with escaped content
                const cells = [
                    escapeHtml(store.storeName),
                    escapeHtml(store.address),
                    escapeHtml(store.postalCode),
                    escapeHtml(store.location),
                    escapeHtml(store.cuisine),
                    escapeHtml(store.priceRange),
                    escapeHtml(store.totalCapacity?.toString()),
                    escapeHtml(store.opening),
                    escapeHtml(store.closing)
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
    document.getElementById('storeName').value = escapeHtml(store.storeName);
    document.getElementById('address').value = escapeHtml(store.address);
    document.getElementById('postalCode').value = escapeHtml(store.postalCode);
    document.getElementById('location').value = escapeHtml(store.location);
    document.getElementById('cuisine').value = escapeHtml(store.cuisine);
    document.getElementById('priceRange').value = escapeHtml(store.priceRange);
    document.getElementById('totalCapacity').value = store.totalCapacity;
    document.getElementById('opening').value = store.opening;
    document.getElementById('closing').value = store.closing;

    document.getElementById('restaurantModalTitle').textContent = 'Edit Restaurant';
    document.getElementById('restaurantModalBtn').textContent = 'Update Restaurant';

    showModal();
}

function submitRestaurantForm() {
    const id = document.getElementById('restaurantId').value;

    if (!id) {
        alert('Restaurant ID is missing.');
        return;
    }

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

    // Validate required fields
    if (!storeData.storeName || !storeData.address || !storeData.postalCode) {
        alert('Please fill in all required fields.');
        return;
    }

    if (storeData.totalCapacity < 1) {
        alert('Total capacity must be at least 1.');
        return;
    }

    fetch(`/api/owner/restaurants/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(storeData)
    })
        .then(res => {
            if (!res.ok) throw new Error('Failed to update restaurant');
            return res.json();
        })
        .then(() => {
            closeModal();
            fetchRestaurants();
            alert('Restaurant updated successfully!');
        })
        .catch(async err => {
            console.error('Update error:', err);
            try {
                const res = await fetch('/api/session/validation-errors');
                const data = await res.json();
                if (data.errors && data.errors.length > 0) {
                    alert('Validation Errors:\n' + data.errors.map(e => `- ${e.msg}`).join('\n'));
                } else {
                    alert('An error occurred while updating the restaurant.');
                }
            } catch (e) {
                alert('An unexpected error occurred.');
            }
        });
}

function closeModal() {
    hideModal();
    document.getElementById('restaurantId').value = '';
    document.getElementById('restaurantForm').reset();
    document.getElementById('restaurantModalTitle').textContent = 'Request New Restaurant';
    document.getElementById('restaurantModalBtn').textContent = 'Send Request';
}

function fetchReservations() {
    fetch('/api/owner/reservations/me')
        .then(res => res.json())
        .then(data => {
            const tableBody = document.querySelector('#reservationTable tbody');
            tableBody.textContent = '';

            data.forEach(reservation => {
                const dateOnly = reservation.reservationDate.split('T')[0];
                const row = document.createElement('tr');

                // Create cells with escaped content
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

                // Special request cell
                const requestTd = document.createElement('td');
                requestTd.textContent = escapeHtml(reservation.specialRequest || '');
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

    fetch(`/api/owner/reservations/${encodeURIComponent(reservationId)}/cancel`, {
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
    fetch('/api/owner/reviews/me')
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
                    escapeHtml(review.description)
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