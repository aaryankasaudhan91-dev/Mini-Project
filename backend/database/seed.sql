-- backend/database/seed.sql
-- Seed ONLY demo accounts with ZERO mock data (all metrics, rooms, and bookings start at 0)
-- Passwords are salted scrypt hashes ('admin123' and 'guest123')

-- Demo Accounts Only (idempotent, never deletes existing rooms or reservations)
INSERT INTO users (full_name, email, password, role, hotel_name) VALUES
('Operations Director', 'admin@horizon.com', '70c314bafee9945c0b75e7f5919e6a52:ecb52b40660cb5731d67b96551a86758768835ba7742ca041d0a8a15081b93b5d3265428f57a2c3299d81f1a2b5782948c4526f6e1ddcd57217edd0b3609e2c0', 'admin', 'Grand Horizon Hotel'),
('Priya Sharma', 'customer@horizon.com', 'a08ba82443c5e90c9624284b78fface8:fc877f1935adde425187f02a5986e1ad2d733ff0dfbed0965ea9be325a919712a234a8007c701b4f50981a08a63a44ba67774a1d81fa47f5154df60a2da36bb2', 'customer', NULL)
ON CONFLICT (email) DO NOTHING;

-- ZERO ROOMS INSERTED: Inventory starts at 0.
-- ZERO BOOKINGS INSERTED: Active bookings starts at 0, Occupancy at 0%, Revenue at ₹0.
