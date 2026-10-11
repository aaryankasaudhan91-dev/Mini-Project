-- backend/database/seed.sql
-- Seed ONLY demo accounts with ZERO mock data (all metrics, rooms, and bookings start at 0)

-- 1. Ensure clean slate (no mock rooms, no mock bookings)
DELETE FROM bookings;
DELETE FROM rooms;

-- 2. Demo Accounts Only (Scrypt/hashed or plaintext upgraded on login)
INSERT INTO users (full_name, email, password, role, hotel_name) VALUES
('Operations Director', 'admin@horizon.com', 'admin123', 'admin', 'Grand Horizon Hotel'),
('Priya Sharma', 'customer@horizon.com', 'guest123', 'customer', NULL)
ON CONFLICT (email) DO NOTHING;

-- ZERO ROOMS INSERTED: Inventory starts at 0.
-- ZERO BOOKINGS INSERTED: Active bookings starts at 0, Occupancy at 0%, Revenue at ₹0.
