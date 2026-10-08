// frontend/js/store.js
// Client Session & Auth Store (Zero Mock Data — 100% Real PostgreSQL Backend)

export const DEMO_CREDENTIALS = {
  admin: {
    email: 'admin@horizon.com',
    password: 'admin123'
  },
  customer: {
    email: 'customer@horizon.com',
    password: 'guest123'
  }
};

export const Store = {
  getToken() {
    return localStorage.getItem('hms_token') || null;
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('hms_token', token);
    } else {
      localStorage.removeItem('hms_token');
    }
  },

  getCurrentUser() {
    const raw = localStorage.getItem('hms_session');
    return raw ? JSON.parse(raw) : null;
  },

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem('hms_session', JSON.stringify(user));
    } else {
      localStorage.removeItem('hms_session');
    }
  },

  logout() {
    localStorage.removeItem('hms_session');
    localStorage.removeItem('hms_token');
  }
};
