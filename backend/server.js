// backend/server.js
// Production Hotel Management System API with JWT Authentication,
// Multi-Tenant Isolation, Transactional Concurrency Protection, and Date-Aware Availability

import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  requireAuth,
  requireAdmin,
  optionalAuth
} from './auth.js';

export const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', serverTime: new Date(), dbTime: dbRes.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'db_error', error: err.message });
  }
});

// ==========================================
// 1. AUTHENTICATION ROUTES (JWT & Scrypt Hashing)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, full_name, email, role, hotel_name, password FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    const user = result.rows[0];
    const isMatch = verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Upgrade plaintext password to hash in background if needed
    if (!user.password.includes(':')) {
      pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashPassword(password), user.id]).catch(() => {});
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = generateToken(userWithoutPassword);

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password, role = 'customer', hotelName = '' } = req.body;
    if (typeof fullName !== 'string' || !fullName.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || typeof hotelName !== 'string') {
      return res.status(400).json({ error: 'Full name, email, and password are required' });
    }

    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid account role' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const assignedHotel = role === 'admin' ? (hotelName.trim() || `${fullName.trim()}'s Hotel`) : null;
    const hashedPassword = hashPassword(password);

    const insertResult = await pool.query(
      `INSERT INTO users (full_name, email, password, role, hotel_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role, hotel_name, created_at`,
      [fullName.trim(), email.trim().toLowerCase(), hashedPassword, role, assignedHotel]
    );

    const newUser = insertResult.rows[0];
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ==========================================
// 2. ROOMS ROUTES (Date-Aware Availability & Strict Staff Scoping)
// ==========================================
app.get('/api/rooms', optionalAuth, async (req, res) => {
  try {
    const { status, type, hotelName, checkIn, checkOut } = req.query;
    const params = [];
    let query = '';

    // If check-in and check-out dates are supplied, compute availability specifically for those dates!
    if (checkIn && checkOut) {
      params.push(checkOut, checkIn); // $1, $2
      query = `
        SELECT r.*,
          CASE
            WHEN r.status = 'maintenance' THEN 'maintenance'
            WHEN EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.room_id = r.id
                AND b.status IN ('confirmed', 'checked_in')
                AND b.check_in < $1 AND b.check_out > $2
            ) THEN 'occupied'
            ELSE 'available'
          END AS computed_status
        FROM rooms r
        WHERE 1=1
      `;
    } else {
      query = `SELECT r.*, r.status AS computed_status FROM rooms r WHERE 1=1`;
    }

    // Role-based or query-based hotel filtering:
    // Hotel names are display/search fields; administrator IDs enforce ownership.
    if (req.user && req.user.role === 'admin') {
      params.push(req.user.id);
      query += ` AND r.admin_id = $${params.length}`;
    } else if (hotelName) {
      params.push(hotelName);
      query += ` AND LOWER(r.hotel_name) = LOWER($${params.length})`;
    }

    if (type && type !== 'all') {
      params.push(type);
      query += ` AND r.room_type = $${params.length}`;
    }

    query += ' ORDER BY r.price_per_night ASC';
    const result = await pool.query(query, params);

    // Apply status filter against computed_status if requested
    let rooms = result.rows.map(r => ({
      ...r,
      status: r.computed_status // Real-time date-accurate status
    }));

    if (status) {
      rooms = rooms.filter(r => r.status === status);
    }

    res.json(rooms);
  } catch (err) {
    console.error('Fetch rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.post('/api/rooms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { room_number, room_type, price_per_night, capacity, image_url, description, status = 'available' } = req.body;
    if (!room_number || !room_type || !price_per_night || !capacity) {
      return res.status(400).json({ error: 'Missing required room fields' });
    }

    // Enforce hotel ownership from authenticated admin token
    const assignedHotel = req.user.hotel_name;
    const adminId = req.user.id;

    const insertRes = await pool.query(
      `INSERT INTO rooms (admin_id, hotel_name, room_number, room_type, price_per_night, capacity, image_url, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        adminId,
        assignedHotel,
        String(room_number).trim(),
        room_type,
        parseFloat(price_per_night),
        parseInt(capacity, 10),
        image_url || 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
        description || 'Luxury accommodation with modern amenities.',
        status
      ]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Add room error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: `Room ${req.body.room_number} already exists in ${req.user.hotel_name}` });
    }
    res.status(500).json({ error: 'Failed to create room: ' + err.message });
  }
});

app.patch('/api/rooms/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Verify room belongs to this admin's hotel
    const checkRoom = await pool.query('SELECT admin_id FROM rooms WHERE id = $1', [id]);
    if (checkRoom.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    if (checkRoom.rows[0].admin_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied: Cannot modify room of another hotel.' });
    }

    const result = await pool.query(
      'UPDATE rooms SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update room status error:', err);
    res.status(500).json({ error: 'Failed to update room status' });
  }
});

app.delete('/api/rooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify room belongs to this admin's hotel
    const checkRoom = await pool.query('SELECT admin_id FROM rooms WHERE id = $1', [id]);
    if (checkRoom.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    if (checkRoom.rows[0].admin_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied: Cannot delete room of another hotel.' });
    }

    await pool.query('DELETE FROM rooms WHERE id = $1', [id]);
    res.json({ message: 'Room deleted successfully', id });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ error: 'Failed to delete room. It may have associated bookings.' });
  }
});

// ==========================================
// 3. BOOKINGS ROUTES (Atomic Transactional Overlap Protection)
// ==========================================
app.get('/api/bookings', requireAuth, async (req, res) => {
  try {
    let query = `
      SELECT b.*, r.room_number, r.room_type, r.image_url
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      WHERE 1=1
    `;
    const params = [];

    // Strict Role-Based Data Isolation:
    if (req.user.role === 'admin') {
      // Admin sees ONLY bookings for their own hotel
      params.push(req.user.id);
      query += ` AND b.admin_id = $${params.length}`;
    } else {
      // Customer sees ONLY their own bookings
      params.push(req.user.id);
      query += ` AND b.user_id = $${params.length}`;
    }

    query += ' ORDER BY b.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

/**
 * Atomic Booking Transaction with Row-Level Lock
 * Eliminates race-condition double bookings across concurrent requests
 */
app.post('/api/bookings', requireAuth, async (req, res) => {
  let client;
  try {
    const { roomId, checkIn, checkOut, customerName, customerEmail } = req.body;
    if (!roomId || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Missing booking parameters (roomId, checkIn, checkOut)' });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return res.status(400).json({ error: 'Invalid check-in or check-out date format' });
    }
    if (checkOutDate <= checkInDate) {
      return res.status(400).json({ error: 'Check-out date must be strictly after check-in date' });
    }

    // Acquire inside the handler so connection failures receive an HTTP response.
    client = await pool.connect();
    await client.query('BEGIN');

    // Acquire exclusive row lock on the target room
    const roomRes = await client.query('SELECT * FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = roomRes.rows[0];
    if (room.status === 'maintenance') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Room ${room.room_number} is currently under maintenance and cannot be booked.` });
    }

    // Atomic conflict verification within the locked room transaction
    const conflictRes = await client.query(
      `SELECT id, customer_name, check_in, check_out
       FROM bookings
       WHERE room_id = $1
         AND status IN ('confirmed', 'checked_in')
         AND check_in < $2 AND check_out > $3`,
      [roomId, checkOut, checkIn]
    );

    if (conflictRes.rows.length > 0) {
      await client.query('ROLLBACK');
      const conflict = conflictRes.rows[0];
      const conflictStart = new Date(conflict.check_in).toISOString().split('T')[0];
      const conflictEnd = new Date(conflict.check_out).toISOString().split('T')[0];
      return res.status(409).json({
        error: `Room ${room.room_number} (${room.hotel_name}) is already reserved for overlapping dates (${conflictStart} to ${conflictEnd}). Please select another room or date range.`
      });
    }

    const diffDays = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
    const totalAmount = diffDays * parseFloat(room.price_per_night);

    const bookingRes = await client.query(
      `INSERT INTO bookings (user_id, admin_id, hotel_name, customer_name, customer_email, room_id, check_in, check_out, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed')
       RETURNING *`,
      [
        req.user.id,
        room.admin_id,
        room.hotel_name,
        customerName || req.user.full_name || 'Guest User',
        customerEmail || req.user.email || 'guest@example.com',
        roomId,
        checkIn,
        checkOut,
        totalAmount
      ]
    );

    // Commit transaction atomically
    await client.query('COMMIT');
    res.status(201).json(bookingRes.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Create booking transaction error:', err);
    res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    client?.release();
  }
});

app.patch('/api/bookings/:id/status', requireAuth, async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { status } = req.body;
    const transitions = {
      confirmed: ['checked_in', 'cancelled'],
      checked_in: ['checked_out'],
      checked_out: [],
      cancelled: ['confirmed']
    };
    if (!Object.hasOwn(transitions, status)) {
      return res.status(400).json({ error: 'Invalid booking status' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const reject = async (code, error) => {
      await client.query('ROLLBACK');
      return res.status(code).json({ error });
    };
    const initial = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (!initial.rows.length) return await reject(404, 'Booking not found');

    // Lock room before booking, matching creation's lock order.
    const roomResult = await client.query('SELECT * FROM rooms WHERE id = $1 FOR UPDATE', [initial.rows[0].room_id]);
    if (!roomResult.rows.length) return await reject(404, 'Room not found');
    const current = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows.length) return await reject(404, 'Booking not found');
    const booking = current.rows[0];
    const room = roomResult.rows[0];

    if (req.user.role === 'customer') {
      if (booking.user_id !== req.user.id || status !== 'cancelled') {
        return await reject(403, 'Customers can only cancel their own reservations.');
      }
      if (!['confirmed', 'cancelled'].includes(booking.status)) {
        return await reject(409, 'Only confirmed reservations can be cancelled.');
      }
    } else if (req.user.role !== 'admin' || room.admin_id !== req.user.id) {
      return await reject(403, 'Permission denied: Cannot modify another hotel reservation.');
    }

    if (status === booking.status) {
      await client.query('COMMIT');
      return res.json(booking);
    }
    if (!transitions[booking.status]?.includes(status)) {
      return await reject(409, `Cannot change ${booking.status} to ${status}.`);
    }
    if (['confirmed', 'checked_in'].includes(status)) {
      if (room.status === 'maintenance') {
        return await reject(409, 'Room is under maintenance.');
      }
      const conflict = await client.query(
        `SELECT id FROM bookings
         WHERE room_id = $1 AND id != $2
           AND status IN ('confirmed', 'checked_in')
           AND check_in < $3 AND check_out > $4`,
        [booking.room_id, booking.id, booking.check_out, booking.check_in]
      );
      if (conflict.rows.length) return await reject(409, 'Room is already reserved for overlapping dates.');
    }

    const result = await client.query(
      'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *', [status, id]
    );
    // Reservation and cached room occupancy commit or roll back together.
    await client.query(
      `UPDATE rooms SET status = CASE
         WHEN status = 'maintenance' THEN 'maintenance'
         WHEN EXISTS (SELECT 1 FROM bookings WHERE room_id = $1 AND status = 'checked_in')
           THEN 'occupied'
         ELSE 'available'
       END WHERE id = $1`, [booking.room_id]
    );
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Update booking status error:', err);
    res.status(500).json({ error: 'Failed to update booking status' });
  } finally {
    client?.release();
  }
});

// ==========================================
// 4. ADMIN METRICS (Strict Token Hotel Scoping)
// ==========================================
app.get('/api/metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const hotelName = req.user.hotel_name;
    const params = [req.user.id];

    const totalRoomsRes = await pool.query(
      'SELECT COUNT(*) FROM rooms WHERE admin_id = $1',
      params
    );
    const activeBookingsRes = await pool.query(
      "SELECT COUNT(*) FROM bookings WHERE admin_id = $1 AND status IN ('confirmed', 'checked_in')",
      params
    );
    const occupiedRoomsRes = await pool.query(
      `SELECT COUNT(DISTINCT room_id) AS count FROM bookings
       WHERE admin_id = $1 AND status IN ('confirmed', 'checked_in')
         AND check_in <= CURRENT_DATE AND check_out > CURRENT_DATE`,
      params
    );
    const revenueRes = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) AS revenue FROM bookings WHERE admin_id = $1 AND status != 'cancelled'",
      params
    );

    const totalRooms = parseInt(totalRoomsRes.rows[0].count, 10);
    const activeBookings = parseInt(activeBookingsRes.rows[0].count, 10);
    const occupiedRooms = parseInt(occupiedRoomsRes.rows[0].count, 10);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const totalRevenue = parseFloat(revenueRes.rows[0].revenue);

    res.json({
      hotelName,
      totalRooms,
      activeBookings,
      occupiedRooms,
      occupancyRate,
      totalRevenue
    });
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ error: 'Failed to calculate metrics' });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`HMS Backend Server running at http://localhost:${PORT}`);
  });
}
