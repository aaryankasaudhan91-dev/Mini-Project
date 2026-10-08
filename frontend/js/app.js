// frontend/js/app.js
// Main Single-Page Application (SPA) Controller with Secure Role Authorization,
// Sanitized Room Data Binding, and Date-Aware Availability Search

import { Api } from './api.js';
import { Store, DEMO_CREDENTIALS } from './store.js';

// In-Memory Room Cache (Prevents inline JSON/HTML injection bugs in click handlers)
window._roomsCache = new Map();

/**
 * HTML Sanitizer to prevent XSS and quote-breaking in template literals
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================================
// 1. NAVIGATION & VIEW ROUTING
// ============================================================================
window.showView = function(viewName) {
    document.querySelectorAll('.spa-view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active-tab'));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetTab = document.getElementById(`tab-${viewName}`);

    if (targetView) targetView.classList.add('active-view');
    if (targetTab) targetTab.classList.add('active-tab');

    window.location.hash = viewName;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh view data
    if (viewName === 'home') loadHomeRooms();
    if (viewName === 'rooms') loadCatalogRooms();
    if (viewName === 'customer') loadCustomerPortal();
    if (viewName === 'admin') loadAdminPortal();
};

// ============================================================================
// 2. AUTH STATE & HEADER UI
// ============================================================================
export function updateAuthHeader() {
    const user = Store.getCurrentUser();
    const controls = document.getElementById('header-user-controls');
    if (!controls) return;

    if (user) {
        controls.innerHTML = `
            <span style="font-size: 0.88rem; font-weight: 600; color: var(--teal-900);">
                ${user.role === 'admin' ? '👑' : '🧳'} ${escapeHtml(user.full_name)}
            </span>
            <button type="button" class="btn-secondary" id="spa-logout-btn" style="padding: 0.4rem 0.8rem; font-size: 0.82rem;">
                Sign Out
            </button>
        `;
        document.getElementById('spa-logout-btn')?.addEventListener('click', () => {
            Store.logout();
            updateAuthHeader();
            showView('home');
        });
    } else {
        controls.innerHTML = `
            <button type="button" class="btn-secondary" onclick="showView('login')">Sign In</button>
            <button type="button" class="btn-primary" onclick="showView('register')">Register</button>
        `;
    }
}

// ============================================================================
// 3. DEMO CREDENTIALS & REGISTRATION HELPERS
// ============================================================================
document.getElementById('demo-admin-btn')?.addEventListener('click', () => {
    const e = document.getElementById('login-email');
    const p = document.getElementById('login-password');
    if (e && p) {
        e.value = DEMO_CREDENTIALS.admin.email;
        p.value = DEMO_CREDENTIALS.admin.password;
        showLoginAlert('👑 Admin credentials filled! Click "Sign In to Portal".', 'success');
    }
});

document.getElementById('demo-customer-btn')?.addEventListener('click', () => {
    const e = document.getElementById('login-email');
    const p = document.getElementById('login-password');
    if (e && p) {
        e.value = DEMO_CREDENTIALS.customer.email;
        p.value = DEMO_CREDENTIALS.customer.password;
        showLoginAlert('🧳 Customer credentials filled! Click "Sign In to Portal".', 'success');
    }
});

// Role selector toggle for Hotel Name in registration
const regRoleSelect = document.getElementById('reg-role');
const regHotelGroup = document.getElementById('reg-hotel-group');
const regHotelInput = document.getElementById('reg-hotel-name');

regRoleSelect?.addEventListener('change', (e) => {
    if (e.target.value === 'admin') {
        regHotelGroup?.classList.remove('hidden');
        regHotelInput?.setAttribute('required', 'required');
    } else {
        regHotelGroup?.classList.add('hidden');
        regHotelInput?.removeAttribute('required');
    }
});

document.getElementById('fill-demo-register-btn')?.addEventListener('click', () => {
    const num = Math.floor(100 + Math.random() * 900);
    document.getElementById('reg-name').value = 'Manager ' + num;
    document.getElementById('reg-email').value = `manager${num}@resort.com`;
    document.getElementById('reg-password').value = 'pass123';
    if (regRoleSelect) regRoleSelect.value = 'admin';
    regHotelGroup?.classList.remove('hidden');
    if (regHotelInput) regHotelInput.value = `Emerald Bay Resort ${num}`;
    showRegisterAlert('⚡ Sample Administrator for a new isolated hotel filled! Click "Complete Registration".', 'success');
});

function showLoginAlert(msg, type = 'danger') {
    const a = document.getElementById('login-alert');
    if (!a) return;
    a.textContent = msg;
    a.className = `alert-clean alert-${type}`;
    a.classList.remove('hidden');
}

function showRegisterAlert(msg, type = 'danger') {
    const a = document.getElementById('register-alert');
    if (!a) return;
    a.textContent = msg;
    a.className = `alert-clean alert-${type}`;
    a.classList.remove('hidden');
}

// Login Submit
document.getElementById('spa-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        const user = await Api.login(email, pass);
        updateAuthHeader();
        showLoginAlert(`Welcome back, ${user.full_name}!`, 'success');
        setTimeout(() => {
            if (user.role === 'admin') {
                showView('admin');
            } else {
                showView('customer');
            }
        }, 400);
    } catch (err) {
        showLoginAlert(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In to Portal';
    }
});

// Register Submit with Hotel Name Isolation
document.getElementById('spa-register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;
    const hotelName = role === 'admin' ? (document.getElementById('reg-hotel-name')?.value?.trim() || `${name}'s Hotel`) : '';
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = 'Registering...';

    try {
        const user = await Api.register(name, email, pass, role, hotelName);
        updateAuthHeader();
        showRegisterAlert(`Account registered for ${user.full_name} (${hotelName ? 'Hotel: ' + hotelName : 'Guest'})!`, 'success');
        setTimeout(() => {
            if (user.role === 'admin') {
                showView('admin');
            } else {
                showView('customer');
            }
        }, 500);
    } catch (err) {
        showRegisterAlert(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Complete Registration';
    }
});

// ============================================================================
// 4. RESERVATION MODAL LOGIC (Secure ID Lookup)
// ============================================================================
let activeModalRoom = null;
const bookingModal = document.getElementById('spa-booking-modal');
const modalSummary = document.getElementById('spa-modal-summary');
const modalCheckin = document.getElementById('spa-modal-checkin');
const modalCheckout = document.getElementById('spa-modal-checkout');

window.triggerBookingModalById = function(roomId) {
    const room = window._roomsCache.get(Number(roomId));
    if (!room) {
        alert('Room information not found. Please refresh the page.');
        return;
    }
    window.triggerBookingModal(room);
};

window.triggerBookingModal = function(room) {
    let user = Store.getCurrentUser();
    if (!user) {
        alert('Please sign in to book a room.');
        showView('login');
        return;
    }

    activeModalRoom = room;
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

    modalCheckin.min = today;
    modalCheckin.value = today;
    modalCheckout.min = today;
    modalCheckout.value = tomorrow;

    modalSummary.innerHTML = `
        <strong>Room ${escapeHtml(room.room_number)} (${escapeHtml(room.room_type)})</strong><br>
        🏨 <strong>${escapeHtml(room.hotel_name || 'Grand Horizon Hotel')}</strong><br>
        💰 Rate: ₹${Number(room.price_per_night).toLocaleString('en-IN')} / night<br>
        👤 Guest: ${escapeHtml(user.full_name)} (${escapeHtml(user.email)})
    `;

    bookingModal.showModal();
};

document.getElementById('spa-modal-cancel')?.addEventListener('click', () => {
    bookingModal.close();
});

document.getElementById('spa-modal-booking-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = Store.getCurrentUser();
    if (!user || !activeModalRoom) return;

    const checkIn = modalCheckin.value;
    const checkOut = modalCheckout.value;

    if (new Date(checkOut) <= new Date(checkIn)) {
        alert('Check-out date must be after check-in date.');
        return;
    }

    const btn = document.getElementById('spa-modal-submit');
    btn.disabled = true;
    btn.textContent = 'Confirming...';

    try {
        await Api.createBooking({
            roomId: activeModalRoom.id,
            checkIn,
            checkOut,
            customerName: user.full_name,
            customerEmail: user.email
        });

        bookingModal.close();
        alert(`🎉 Booking confirmed for Room ${activeModalRoom.room_number}!`);
        showView('customer');
    } catch (err) {
        // Real server error displayed directly to user (e.g. 409 Overlap Conflict)
        alert('Booking Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Reservation';
    }
});

// ============================================================================
// 5. PUBLIC ACCOMMODATIONS (HOME & CATALOG)
// ============================================================================
async function loadHomeRooms() {
    const container = document.getElementById('home-featured-rooms');
    if (!container) return;
    const rooms = await Api.getRooms({ status: 'available' });
    
    // Cache rooms
    rooms.forEach(r => window._roomsCache.set(r.id, r));

    container.innerHTML = rooms.slice(0, 3).map(r => `
        <div class="room-card-clean">
            <div class="room-card-media">
                <span class="room-tag-category">${escapeHtml(r.room_type)}</span>
                <span class="room-tag-status badge-available">Available</span>
                <img src="${escapeHtml(r.image_url || 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80')}" alt="Room ${escapeHtml(r.room_number)}">
            </div>
            <div class="room-card-body">
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--teal-700); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">
                    🏨 ${escapeHtml(r.hotel_name || 'Grand Horizon Hotel')}
                </div>
                <div class="room-card-header">
                    <h3>Room ${escapeHtml(r.room_number)}</h3>
                    <div class="room-card-price">₹${Number(r.price_per_night).toLocaleString('en-IN')} <span>/ night</span></div>
                </div>
                <p class="room-card-desc">${escapeHtml(r.description || 'Premium suite with ocean breeze ventilation and high speed wifi.')}</p>
                <div class="room-card-meta">
                    <span>👥 Up to ${r.capacity} Guests</span>
                </div>
                <button type="button" class="btn-primary" onclick="window.triggerBookingModalById(${r.id})">
                    Book This Room
                </button>
            </div>
        </div>
    `).join('');
}

async function loadCatalogRooms() {
    const container = document.getElementById('catalog-rooms-grid');
    if (!container) return;
    const type = document.getElementById('filter-type')?.value || 'all';
    const status = document.getElementById('filter-status')?.value || '';

    const rooms = await Api.getRooms({ type, status });
    if (!rooms || rooms.length === 0) {
        container.innerHTML = `<p class="empty-state-clean" style="grid-column: 1 / -1;">No rooms match your filter.</p>`;
        return;
    }

    // Cache rooms
    rooms.forEach(r => window._roomsCache.set(r.id, r));

    container.innerHTML = rooms.map(r => `
        <div class="room-card-clean">
            <div class="room-card-media">
                <span class="room-tag-category">${escapeHtml(r.room_type)}</span>
                <span class="room-tag-status badge-${r.status}">${r.status === 'occupied' ? 'Not Available' : r.status === 'available' ? 'Available' : 'Maintenance'}</span>
                <img src="${escapeHtml(r.image_url || 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80')}" alt="Room ${escapeHtml(r.room_number)}">
            </div>
            <div class="room-card-body">
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--teal-700); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">
                    🏨 ${escapeHtml(r.hotel_name || 'Grand Horizon Hotel')}
                </div>
                <div class="room-card-header">
                    <h3>Room ${escapeHtml(r.room_number)}</h3>
                    <div class="room-card-price">₹${Number(r.price_per_night).toLocaleString('en-IN')} <span>/ night</span></div>
                </div>
                <p class="room-card-desc">${escapeHtml(r.description || 'Premium suite.')}</p>
                <div class="room-card-meta">
                    <span>👥 Capacity: ${r.capacity} Guests</span>
                </div>
                ${r.status === 'available' ? `
                    <button type="button" class="btn-primary" onclick="window.triggerBookingModalById(${r.id})">
                        Reserve Room
                    </button>
                ` : r.status === 'occupied' ? `
                    <button type="button" class="btn-secondary" disabled style="opacity: 0.75; cursor: not-allowed; background: #fee2e2; color: #991b1b; border-color: #fca5a5; font-weight: 600;">
                        Not Available (Occupied)
                    </button>
                ` : `
                    <button type="button" class="btn-secondary" disabled style="opacity: 0.6; cursor: not-allowed;">
                        In Maintenance
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

document.getElementById('filter-type')?.addEventListener('change', loadCatalogRooms);
document.getElementById('filter-status')?.addEventListener('change', loadCatalogRooms);
document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
    const ft = document.getElementById('filter-type');
    const fs = document.getElementById('filter-status');
    if (ft) ft.value = 'all';
    if (fs) fs.value = 'available';
    loadCatalogRooms();
});

// ============================================================================
// 6. GUEST / CUSTOMER PORTAL (Date-Aware Search & Strict Auth Check)
// ============================================================================
async function loadCustomerPortal() {
    const user = Store.getCurrentUser();
    if (!user) {
        alert('Authentication Required: Please sign in or register to access the Guest Portal.');
        showView('login');
        return;
    }

    const bannerWelcome = document.getElementById('customer-banner-welcome');
    if (bannerWelcome) bannerWelcome.textContent = `Welcome, ${escapeHtml(user.full_name)}`;

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];
    const ci = document.getElementById('cust-checkin');
    const co = document.getElementById('cust-checkout');
    if (ci && !ci.value) { ci.min = today; ci.value = today; }
    if (co && !co.value) { co.min = today; co.value = tomorrow; }

    await searchCustomerRooms();
    await loadCustomerBookings();
}

/**
 * Date-Aware Customer Search:
 * Checks availability strictly for the requested stay window!
 */
async function searchCustomerRooms() {
    const type = document.getElementById('cust-category')?.value || 'all';
    const checkIn = document.getElementById('cust-checkin')?.value;
    const checkOut = document.getElementById('cust-checkout')?.value;

    const rooms = await Api.getRooms({
        type,
        status: 'available',
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined
    });

    const grid = document.getElementById('customer-available-grid');
    if (!grid) return;

    if (!rooms || rooms.length === 0) {
        grid.innerHTML = `<p class="empty-state-clean" style="grid-column: 1 / -1;">No available rooms match your dates (${checkIn || 'any'} to ${checkOut || 'any'}).</p>`;
        return;
    }

    // Cache rooms
    rooms.forEach(r => window._roomsCache.set(r.id, r));

    grid.innerHTML = rooms.map(r => `
        <div class="room-card-clean">
            <div class="room-card-media">
                <span class="room-tag-category">${escapeHtml(r.room_type)}</span>
                <span class="room-tag-status badge-available">Available for Stay</span>
                <img src="${escapeHtml(r.image_url || 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80')}" alt="Room ${escapeHtml(r.room_number)}">
            </div>
            <div class="room-card-body">
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--teal-700); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">
                    🏨 ${escapeHtml(r.hotel_name || 'Grand Horizon Hotel')}
                </div>
                <div class="room-card-header">
                    <h3>Room ${escapeHtml(r.room_number)}</h3>
                    <div class="room-card-price">₹${Number(r.price_per_night).toLocaleString('en-IN')} <span>/ night</span></div>
                </div>
                <p class="room-card-desc">${escapeHtml(r.description || 'Luxury accommodation.')}</p>
                <button type="button" class="btn-primary" onclick="window.triggerBookingModalById(${r.id})">
                    Select & Book
                </button>
            </div>
        </div>
    `).join('');
}

document.getElementById('customer-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    searchCustomerRooms();
});

async function loadCustomerBookings() {
    const tbody = document.getElementById('customer-bookings-body');
    if (!tbody) return;
    const bookings = await Api.getBookings();

    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state-clean">No reservations found. Book above!</td></tr>`;
        return;
    }

    tbody.innerHTML = bookings.map(b => `
        <tr>
            <td><strong>#${b.id}</strong></td>
            <td>
                Room ${escapeHtml(b.room_number || b.room_id)} (${escapeHtml(b.room_type || 'Standard')})<br>
                <small style="color: var(--teal-700); font-weight: 600;">🏨 ${escapeHtml(b.hotel_name || 'Grand Horizon Hotel')}</small>
            </td>
            <td>${b.check_in?.split('T')[0] || b.check_in}</td>
            <td>${b.check_out?.split('T')[0] || b.check_out}</td>
            <td><strong>₹${Number(b.total_amount).toLocaleString('en-IN')}</strong></td>
            <td><span class="badge-clean badge-${b.status}">${b.status}</span></td>
            <td>
                ${b.status === 'confirmed' ? `
                    <button type="button" class="btn-danger" style="padding: 0.35rem 0.7rem; font-size: 0.8rem;" onclick="cancelBookingAction(${b.id})">
                        Cancel
                    </button>
                ` : `<span style="color: var(--text-muted); font-size: 0.85rem;">None</span>`}
            </td>
        </tr>
    `).join('');
}

window.cancelBookingAction = async function(bId) {
    if (confirm(`Are you sure you want to cancel reservation #${bId}?`)) {
        try {
            await Api.updateBookingStatus(bId, 'cancelled');
            loadCustomerBookings();
        } catch (err) {
            alert('Cancellation failed: ' + err.message);
        }
    }
};

// ============================================================================
// 7. STAFF OPERATIONS CONSOLE (Strict Permission Checks & No Auto-Login)
// ============================================================================
async function loadAdminPortal() {
    const user = Store.getCurrentUser();
    
    // Strict Admin Authorization: NO AUTO-LOGIN BYPASS
    if (!user || user.role !== 'admin') {
        alert('Access Denied: Please sign in with a Hotel Staff Administrator account to access the Staff Console.');
        showView('login');
        return;
    }

    const currentHotel = user.hotel_name || 'Grand Horizon Hotel';
    const adminTitle = document.getElementById('admin-hotel-title');
    const adminBadge = document.getElementById('admin-hotel-badge');
    if (adminTitle) adminTitle.textContent = `${currentHotel} — Staff Command Center`;
    if (adminBadge) adminBadge.textContent = `Property: ${currentHotel} (Data Isolated)`;

    try {
        // Metrics strictly isolated for this admin's hotel
        const metrics = await Api.getMetrics({ hotelName: currentHotel });
        const totRooms = document.getElementById('admin-total-rooms');
        const actBookings = document.getElementById('admin-active-bookings');
        const occRate = document.getElementById('admin-occupancy-rate');
        const totRevenue = document.getElementById('admin-total-revenue');

        if (totRooms) totRooms.textContent = metrics.totalRooms;
        if (actBookings) actBookings.textContent = metrics.activeBookings;
        if (occRate) occRate.textContent = `${metrics.occupancyRate}%`;
        if (totRevenue) totRevenue.textContent = `₹${Number(metrics.totalRevenue).toLocaleString('en-IN')}`;

        // Inventory strictly isolated for this admin's hotel
        const rooms = await Api.getRooms({ hotelName: currentHotel });
        const invBody = document.getElementById('admin-inventory-body');
        if (invBody) {
            if (!rooms || rooms.length === 0) {
                invBody.innerHTML = `<tr><td colspan="6" class="empty-state-clean">No rooms in ${escapeHtml(currentHotel)} yet. Click "+ Add New Room" to add inventory!</td></tr>`;
            } else {
                invBody.innerHTML = rooms.map(r => `
                    <tr>
                        <td><strong>Room ${escapeHtml(r.room_number)}</strong></td>
                        <td><span class="room-tag-category" style="position: static;">${escapeHtml(r.room_type)}</span></td>
                        <td>₹${Number(r.price_per_night).toLocaleString('en-IN')}</td>
                        <td>${r.capacity} Guests</td>
                        <td>
                            <span class="badge-clean badge-${r.status}">
                                ${r.status === 'occupied' ? '🔴 Not Available (Occupied)' : r.status === 'available' ? '🟢 Available' : '🟡 Maintenance'}
                            </span>
                        </td>
                        <td>
                            <button type="button" class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="toggleRoomStatusAction(${r.id}, '${r.status === 'available' ? 'maintenance' : 'available'}')">
                                Mark ${r.status === 'available' ? 'Maintenance' : 'Available'}
                            </button>
                            <button type="button" class="btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; margin-left: 0.4rem;" onclick="deleteRoomAction(${r.id})">
                                Delete
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Ledger strictly isolated for this admin's hotel
        const bookings = await Api.getBookings();
        const ledBody = document.getElementById('admin-ledger-body');
        if (ledBody) {
            if (!bookings || bookings.length === 0) {
                ledBody.innerHTML = `<tr><td colspan="7" class="empty-state-clean"><span>📋</span> No reservations on file for ${escapeHtml(currentHotel)} (All accounts start clean at zero).</td></tr>`;
            } else {
                ledBody.innerHTML = bookings.map(b => `
                    <tr>
                        <td><strong>#${b.id}</strong></td>
                        <td>${escapeHtml(b.customer_name || 'Guest')}<br><small style="color: var(--text-muted);">${escapeHtml(b.customer_email || '')}</small></td>
                        <td>Room ${escapeHtml(b.room_number || b.room_id)}</td>
                        <td>${b.check_in?.split('T')[0] || b.check_in} → ${b.check_out?.split('T')[0] || b.check_out}</td>
                        <td><strong>₹${Number(b.total_amount).toLocaleString('en-IN')}</strong></td>
                        <td><span class="badge-clean badge-${b.status}">${b.status}</span></td>
                        <td>
                            <select class="btn-secondary" style="padding: 0.3rem 0.5rem; font-size: 0.8rem;" onchange="updateBookingStatusAction(${b.id}, this.value)">
                                <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="checked_in" ${b.status === 'checked_in' ? 'selected' : ''}>Checked In</option>
                                <option value="checked_out" ${b.status === 'checked_out' ? 'selected' : ''}>Checked Out</option>
                                <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                            </select>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        alert('Failed to load staff console: ' + err.message);
    }
}

window.toggleRoomStatusAction = async function(id, nextStatus) {
    try {
        await Api.updateRoomStatus(id, nextStatus);
        loadAdminPortal();
    } catch (err) {
        alert('Action failed: ' + err.message);
    }
};

window.deleteRoomAction = async function(id) {
    if (confirm(`Delete Room #${id}?`)) {
        try {
            await Api.deleteRoom(id);
            loadAdminPortal();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    }
};

window.updateBookingStatusAction = async function(id, newStatus) {
    try {
        await Api.updateBookingStatus(id, newStatus);
        loadAdminPortal();
    } catch (err) {
        alert('Status update failed: ' + err.message);
    }
};

// Add Room Toggle & Form Submission
const toggleAddBtn = document.getElementById('btn-toggle-add-room-spa');
const addForm = document.getElementById('admin-add-room-form');
toggleAddBtn?.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
    toggleAddBtn.textContent = addForm.classList.contains('hidden') ? '+ Add New Room' : '✕ Close Form';
});

addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = document.getElementById('adm-room-num').value.trim();
    const type = document.getElementById('adm-room-type').value;
    const price = document.getElementById('adm-room-price').value;
    const cap = document.getElementById('adm-room-cap').value;
    const img = document.getElementById('adm-room-img').value.trim();

    try {
        await Api.addRoom({
            room_number: num,
            room_type: type,
            price_per_night: price,
            capacity: cap,
            image_url: img
        });
        addForm.reset();
        addForm.classList.add('hidden');
        if (toggleAddBtn) toggleAddBtn.textContent = '+ Add New Room';
        alert(`✅ Room ${num} successfully added!`);
        loadAdminPortal();
    } catch (err) {
        alert('Error adding room: ' + err.message);
    }
});

// ============================================================================
// 8. STARTUP & ROUTING INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    updateAuthHeader();

    // Health check with PostgreSQL backend
    const dbOk = await Api.healthCheck();
    const pill = document.getElementById('db-status-pill');
    if (pill) {
        pill.innerHTML = dbOk 
            ? `<span class="status-dot"></span> PostgreSQL Active` 
            : `<span class="status-dot" style="background:#ef4444;"></span> Server Offline`;
    }

    const initialHash = window.location.hash.replace('#', '') || 'home';
    showView(initialHash);
});

window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '') || 'home';
    showView(h);
});
