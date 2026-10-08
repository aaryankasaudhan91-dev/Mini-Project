// frontend/js/api.js
// Direct PostgreSQL Backend API Client (No Mock Implementation)

import { Store } from './store.js';

// Access backend endpoint dynamically from environment variable (Vite / Node / Browser config)
const ENV_API = (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL));
const API_BASE = ENV_API || (typeof window !== 'undefined' && window.__ENV__?.VITE_API_URL) || 'http://localhost:5000/api';

function getHeaders(contentType = 'application/json') {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  const token = Store.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse(res) {
  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = (typeof data === 'object' && data.error) ? data.error : (typeof data === 'string' ? data : 'API Request Failed');
    const err = new Error(errorMsg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const Api = {
  async healthCheck() {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password })
    });
    const data = await handleResponse(res);
    Store.setCurrentUser(data.user);
    Store.setToken(data.token);
    return data.user;
  },

  async register(fullName, email, password, role, hotelName = '') {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ fullName, email, password, role, hotelName })
    });
    const data = await handleResponse(res);
    Store.setCurrentUser(data.user);
    Store.setToken(data.token);
    return data.user;
  },

  async getRooms(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.type && filters.type !== 'all') params.append('type', filters.type);
    if (filters.hotelName) params.append('hotelName', filters.hotelName);
    if (filters.checkIn) params.append('checkIn', filters.checkIn);
    if (filters.checkOut) params.append('checkOut', filters.checkOut);

    const res = await fetch(`${API_BASE}/rooms?${params.toString()}`, {
      headers: getHeaders(null)
    });
    return await handleResponse(res);
  },

  async addRoom(roomData) {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(roomData)
    });
    return await handleResponse(res);
  },

  async updateRoomStatus(roomId, status) {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status })
    });
    return await handleResponse(res);
  },

  async deleteRoom(roomId) {
    const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
      method: 'DELETE',
      headers: getHeaders(null)
    });
    return await handleResponse(res);
  },

  async getBookings() {
    const res = await fetch(`${API_BASE}/bookings`, {
      headers: getHeaders(null)
    });
    return await handleResponse(res);
  },

  async createBooking(bookingPayload) {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(bookingPayload)
    });
    return await handleResponse(res);
  },

  async updateBookingStatus(bookingId, status) {
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status })
    });
    return await handleResponse(res);
  },

  async getMetrics(options = {}) {
    const params = new URLSearchParams();
    if (options.hotelName) params.append('hotelName', options.hotelName);

    const res = await fetch(`${API_BASE}/metrics?${params.toString()}`, {
      headers: getHeaders(null)
    });
    return await handleResponse(res);
  }
};
