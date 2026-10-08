// backend/auth.js
// Secure Authentication & Authorization Utilities

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hms-secure-jwt-secret-key-2026-production';
const TOKEN_EXPIRY = '7d';

/**
 * Hash password using Node crypto scrypt with random salt
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against stored hash with legacy plaintext fallback
 */
export function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;
  
  // If stored as salt:hash
  if (storedPassword.includes(':')) {
    const [salt, key] = storedPassword.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }
  
  // Legacy fallback for plain text seed passwords
  return password === storedPassword;
}

/**
 * Generate signed JWT
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      hotel_name: user.hotel_name,
      full_name: user.full_name
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Middleware: Verify JWT and attach req.user
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

/**
 * Optional Auth: Attaches req.user if present, but doesn't block unauthenticated visitors
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // Ignore invalid optional token
    }
  }
  next();
}

/**
 * Middleware: Require Administrator role
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Hotel Staff Administrator privileges required.' });
  }
  next();
}
