-- backend/database/schema.sql
-- Hotel Management System (HMS) Multi-Tenant Isolated Schema for PostgreSQL

DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS TABLE (Multi-tenant with hotel_name)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    hotel_name VARCHAR(150), -- Only for staff/admin accounts
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ROOMS TABLE (Isolated per hotel/admin)
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    admin_id INT REFERENCES users(id) ON DELETE CASCADE,
    hotel_name VARCHAR(150) NOT NULL,
    room_number VARCHAR(20) NOT NULL,
    room_type VARCHAR(50) NOT NULL CHECK (room_type IN ('Standard', 'Deluxe', 'Suite')),
    price_per_night NUMERIC(10, 2) NOT NULL CHECK (price_per_night >= 0),
    capacity INT NOT NULL CHECK (capacity > 0),
    image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_room_per_hotel UNIQUE (hotel_name, room_number)
);

-- 3. BOOKINGS TABLE (Isolated per hotel/admin and customer)
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    admin_id INT REFERENCES users(id) ON DELETE CASCADE,
    hotel_name VARCHAR(150) NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(100) NOT NULL,
    room_id INT REFERENCES rooms(id) ON DELETE RESTRICT,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_dates_valid CHECK (check_out > check_in)
);
