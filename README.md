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

### 1. Database Setup & Migrations

```sql
-- Run in psql against your target database
\i backend/database/schema.sql
\i backend/database/seed.sql
```

Then run the migration script to apply operational tables:
```bash
cd backend
node migrate.js
```

### 2. Backend Environment

Configure `backend/.env`:

```env
PORT=8000
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your-password
PGDATABASE=hms_db
JWT_SECRET=your-secret-key-at-least-32-characters
```

### 3. Install and Run

```bash
# Backend (port 8000)
cd backend
npm install
npm test
npm start # or npm run dev

# Frontend (port 5173)
cd ../frontend
npm install
npm run build # or npm run dev
```

---

## Demo Accounts

The database seed provides two ready-to-use demo accounts (with salted scrypt hashes):

| Role            | Email                    | Password   |
|-----------------|--------------------------|------------|
| Admin / Staff   | `admin@horizon.com`    | `admin123` |
| Guest / Customer| `customer@horizon.com` | `guest123` |

---

## API Reference

All routes are prefixed with `/api`.

### Auth & Security

| Method | Route                 | Auth     | Description                                        |
|--------|-----------------------|----------|----------------------------------------------------|
| POST   | /auth/login           | Public   | Login, returns 8-hour JWT and creates session      |
| POST   | /auth/register        | Public   | Register guest (or staff with invitation token)    |
| POST   | /auth/logout          | Required | Revoke current session                             |
| POST   | /auth/password        | Required | Change password and revoke all sessions            |
| POST   | /auth/recovery-code   | Required | Generate private one-time recovery code            |
| POST   | /auth/reset           | Public   | Reset password with recovery code                  |

### Rooms & Housekeeping

| Method | Route                   | Auth     | Description                                              |
|--------|-------------------------|----------|----------------------------------------------------------|
| GET    | /rooms                  | Optional | List rooms; supports `?check_in=&check_out=&room_type=&status=` |
| POST   | /rooms                  | Admin    | Add room to the admin's hotel                            |
| PUT    | /rooms/:id              | Admin    | Update room details                                      |
| DELETE | /rooms/:id              | Admin    | Delete room (only when no bookings exist)                |
| PATCH  | /rooms/:id/housekeeping | Admin    | Update housekeeping status (`ready`, `dirty`, etc.)      |

### Reservations & Billing

| Method | Route                    | Auth     | Description                                              |
|--------|--------------------------|----------|----------------------------------------------------------|
| GET    | /bookings                | Required | Admin sees hotel bookings; customer sees own             |
| POST   | /bookings                | Customer | Atomic booking with overlap check and server price calc  |
| PATCH  | /bookings/:id/status     | Required | Check in or cancel booking                               |
| GET    | /bookings/:id/bill       | Required | View itemized bill (room stay + completed orders)        |
| POST   | /bookings/:id/checkout   | Admin    | Record reception payment and complete checkout atomically|

### Catalog & Guest Orders

| Method | Route                    | Auth     | Description                                              |
|--------|--------------------------|----------|----------------------------------------------------------|
| GET    | /catalog                 | Optional | List available food and service items                    |
| POST   | /catalog                 | Admin    | Add item to hotel catalog                                |
| PUT    | /catalog/:id             | Admin    | Update catalog item                                      |
| GET    | /requests                | Required | Admin sees hotel requests; guest sees own orders         |
| POST   | /requests                | Customer | Place order for food or hotel service (checked-in stay)  |
| PATCH  | /requests/:id            | Required | Staff accepts/declines/completes; guest cancels pending  |
| GET    | /requests/:id/history    | Required | View status update history and comments                  |

### Management & Operations

| Method | Route          | Auth     | Description                                        |
|--------|----------------|----------|----------------------------------------------------|
| GET    | /staff         | Admin    | List staff members for assignment                  |
| POST   | /staff/invites | Admin    | Create single-use 24-hour staff invitation code    |
| GET    | /metrics       | Admin    | Real operational KPIs (rooms, occupancy, revenue)  |
| GET    | /audit         | Admin    | View audit log of staff actions                    |
| GET    | /health        | Public   | Server + DB health check                           |

---

## Running Tests

From `backend/`:

```bash
# Run unit tests
npm test

# Run full integration test suite with temporary PostgreSQL schema
$env:HMS_INTEGRATION_TESTS="1"; npm test
```

---

## Design System

See [DESIGN.md](./DESIGN.md) for the full visual specification (color tokens, typography, component architecture).