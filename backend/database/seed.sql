-- backend/database/seed.sql
-- Seed users and initial clean inventory, with ZERO bookings for all accounts

-- Demo Accounts
INSERT INTO users (full_name, email, password, role, hotel_name) VALUES
('Operations Director', 'admin@horizon.com', 'admin123', 'admin', 'Grand Horizon Hotel'),
('Priya Sharma', 'customer@horizon.com', 'guest123', 'customer', NULL),
('Aarav Mehta', 'aarav@horizon.com', 'guest123', 'customer', NULL)
ON CONFLICT (email) DO NOTHING;

-- Initial Rooms for Grand Horizon Hotel
INSERT INTO rooms (admin_id, hotel_name, room_number, room_type, price_per_night, capacity, image_url, status, description) VALUES
(1, 'Grand Horizon Hotel', '101', 'Standard', 2500.00, 2, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80', 'available', 'Cozy queen-bed room with high-speed Wi-Fi, air conditioning, and peaceful courtyard views.'),
(1, 'Grand Horizon Hotel', '102', 'Standard', 2500.00, 2, 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80', 'available', 'Modern standard accommodation with work desk, ergonomic chair, and luxury toiletries.'),
(1, 'Grand Horizon Hotel', '201', 'Deluxe', 4500.00, 3, 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80', 'available', 'Spacious deluxe room with king bed, private sunrise balcony, minibar, and smart controls.'),
(1, 'Grand Horizon Hotel', '202', 'Deluxe', 4800.00, 3, 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80', 'available', 'Corner deluxe with sweeping ocean horizons, soaking tub, and complimentary espresso service.'),
(1, 'Grand Horizon Hotel', '301', 'Suite', 8500.00, 4, 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80', 'available', 'Penthouse Grand Suite with private terrace, personal butler service, and whirlpool jacuzzi.')
ON CONFLICT (hotel_name, room_number) DO NOTHING;

-- ZERO BOOKINGS INSERTED. Bookings table remains completely empty (0 bookings, 0 revenue for all accounts).
