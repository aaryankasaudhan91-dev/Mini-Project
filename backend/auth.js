// backend/auth.js
// Secure Authentication & Authorization Utilities

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import './config.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'hms-secure-jwt-secret-key-2026-production') {
  throw new Error('Configure JWT_SECRET with a random secret of at least 32 characters.');
}
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
    return keyBuffer.length === derivedKey.length && crypto.timingSafeEqual(keyBuffer, derivedKey);
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
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isInteger(decoded.id) || !['admin', 'customer'].includes(decoded.role)) {
      return res.status(401).json({ error: 'Invalid session identity.' });
    }
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
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (Number.isInteger(decoded.id) && ['admin', 'customer'].includes(decoded.role)) req.user = decoded;
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
