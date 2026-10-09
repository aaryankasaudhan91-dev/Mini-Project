# Grand Horizon -- Hotel Management System

A full-stack, multi-tenant Hotel Management System (HMS) with JWT authentication, date-aware room availability, and atomic booking protection against double-bookings.

---

## Features

- **Multi-Tenant Architecture** - Each admin manages only their own hotel's rooms and bookings; data is strictly isolated by `admin_id`.
- **JWT Auth** - Scrypt-hashed passwords, JWT tokens, role-based access (`admin` / `customer`).
- **Date-Aware Availability** - Room status is computed in real time from active bookings for a given check-in/check-out range.
- **Atomic Booking Transactions** - PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) prevent race-condition double bookings.
- **Status State Machine** - Bookings follow enforced transitions: `confirmed -> checked_in -> checked_out`, `confirmed -> cancelled`.
- **Admin Metrics Dashboard** - Live KPIs: total rooms, active bookings, occupancy %, and total revenue.

---

## Tech Stack

| Layer    | Technology                            |
|----------|---------------------------------------|
| Frontend | Vanilla HTML/CSS/JS, Vite             |
| Backend  | Node.js, Express                      |
| Database | PostgreSQL                            |
| Auth     | JWT (`jsonwebtoken`), Scrypt (Node built-in) |
| Testing  | Node.js built-in test runner          |

---

## Project Structure

```
t1/
├── backend/
│   ├── auth.js          # JWT helpers, password hashing, middleware
│   ├── config.js        # Environment config
│   ├── db.js            # PostgreSQL connection pool
│   ├── server.js        # Express API routes
│   ├── database/
│   │   ├── schema.sql   # Table definitions (users, rooms, bookings)
│   │   └── seed.sql     # Demo data (admin + customer accounts)
│   └── tests/
│       └── postgres.test.js
├── frontend/
│   ├── index.html       # Single-page app
│   ├── css/
│   └── js/
├── vite.config.js
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1. Database Setup

```sql
-- Run in psql against your target database
\i backend/database/schema.sql
\i backend/database/seed.sql
```

### 2. Backend Environment

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/hms
JWT_SECRET=your-secret-key
PORT=5000
```

### 3. Install and Run

```bash
# Install root dev dependencies (Vite)
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Run backend (port 5000)
npm run dev:backend

# Run frontend dev server (port 5173)
npm run dev:frontend
```

---

## Demo Accounts

Seed data provides two ready-to-use accounts:

| Role            | Email                    | Password  |
|-----------------|--------------------------|-----------|
| Admin / Staff   | `admin@horizon.com`    | `admin123` |
| Guest / Customer| `customer@horizon.com` | `guest123` |

---

## API Reference

All routes are prefixed with `/api`.

### Auth

| Method | Route             | Auth | Description           |
|--------|-------------------|------|-----------------------|
| POST   | /auth/login       | --   | Login, returns JWT    |
| POST   | /auth/register    | --   | Register new user     |

### Rooms

| Method | Route               | Auth     | Description                                              |
|--------|---------------------|----------|----------------------------------------------------------|
| GET    | /rooms              | Optional | List rooms; supports `?checkIn=&checkOut=&type=&status=&hotelName=` |
| POST   | /rooms              | Admin    | Add a room to the admin's hotel                          |
| PATCH  | /rooms/:id/status   | Admin    | Update room status                                       |
| DELETE | /rooms/:id          | Admin    | Delete a room                                            |

### Bookings

| Method | Route                    | Auth     | Description                                  |
|--------|--------------------------|----------|----------------------------------------------|
| GET    | /bookings                | Required | Admin sees hotel bookings; customer sees own |
| POST   | /bookings                | Required | Create booking (atomic, overlap-protected)   |
| PATCH  | /bookings/:id/status     | Required | Advance booking status                       |

### Admin

| Method | Route     | Auth  | Description                                        |
|--------|-----------|-------|----------------------------------------------------|
| GET    | /metrics  | Admin | Hotel KPIs (rooms, bookings, occupancy %, revenue) |
| GET    | /health   | --    | Server + DB health check                           |

---

## Running Tests

```bash
npm test
# or from backend/
npm test
```

---

## Design System

See [DESIGN.md](./DESIGN.md) for the full visual specification (color tokens, typography, component architecture).