-- backend/database/seed.sql
-- Seed accounts with short passwords ('admin' and 'guest') and zero mock data
INSERT INTO users (full_name, email, password, role, hotel_name) VALUES
('Operations Director', 'admin@horizon.com', '5fc694668032c08c933d869bb83a120b:f0926cc248279140e109e51503f4beeef4d761643d09d63a8d5725087b9c82367e7c09b7f950e722ead5d27a7fff9b2c1c7a9908eb9f3461a74bfce6b80c2bef', 'admin', 'Grand Horizon Hotel'),
('Priya Sharma', 'customer@horizon.com', '713d115a274f4af0becf33bf56d23d42:12da9e7554f0419abea32573b9c59915053ea06eed3aa8ed245c6fd9145cee6f155669096c08a331635712e763d63795e7e0b18a5279ec41b5859ab6201310eb', 'customer', NULL)
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;
