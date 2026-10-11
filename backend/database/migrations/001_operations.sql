ALTER TABLE users ADD COLUMN IF NOT EXISTS hotel_owner_id INT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS housekeeping TEXT NOT NULL DEFAULT 'ready' CHECK (housekeeping IN ('ready','dirty','cleaning','maintenance'));
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS unique_room_per_hotel;
CREATE UNIQUE INDEX IF NOT EXISTS room_owner_number ON rooms(admin_id, room_number);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count > 0);
CREATE INDEX IF NOT EXISTS booking_room_dates ON bookings(room_id, check_in, check_out) WHERE status IN ('confirmed','checked_in');
CREATE INDEX IF NOT EXISTS bookings_owner ON bookings(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_guest ON bookings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS staff_invites (
  token_hash TEXT PRIMARY KEY, hotel_owner_id INT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS service_catalog (
  id SERIAL PRIMARY KEY, admin_id INT NOT NULL REFERENCES users(id),
  name VARCHAR(120) NOT NULL, category TEXT NOT NULL CHECK (category IN ('food','service')),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0), active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS guest_requests (
  id SERIAL PRIMARY KEY, booking_id INT NOT NULL REFERENCES bookings(id),
  user_id INT NOT NULL REFERENCES users(id), admin_id INT NOT NULL REFERENCES users(id),
  catalog_id INT NOT NULL REFERENCES service_catalog(id), item_name VARCHAR(120) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('food','service')),
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  customer_note VARCHAR(1000) NOT NULL DEFAULT '', admin_comment VARCHAR(1000) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','in_progress','completed','cancelled')),
  assigned_to INT REFERENCES users(id), expected_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1, submission_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_owner_status ON guest_requests(admin_id,status,created_at);
CREATE INDEX IF NOT EXISTS request_booking ON guest_requests(booking_id);
CREATE TABLE IF NOT EXISTS request_updates (
  id SERIAL PRIMARY KEY, request_id INT NOT NULL REFERENCES guest_requests(id),
  actor_id INT NOT NULL REFERENCES users(id), status TEXT NOT NULL, comment VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS checkout_payments (
  id SERIAL PRIMARY KEY, booking_id INT NOT NULL UNIQUE REFERENCES bookings(id),
  admin_id INT NOT NULL REFERENCES users(id), actor_id INT NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','bank_transfer')),
  reference VARCHAR(150) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY, admin_id INT NOT NULL REFERENCES users(id), actor_id INT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_owner_date ON audit_events(admin_id,created_at DESC);
