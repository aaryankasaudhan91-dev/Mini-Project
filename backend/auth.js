import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import './config.js';
import { pool } from './db.js';
const scrypt = promisify(crypto.scrypt);
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32 || secret === 'hms-secure-jwt-secret-key-2026-production') throw new Error('Set a random JWT_SECRET of at least 32 characters.');
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const recoveryCode = () => crypto.randomBytes(24).toString('base64url');
export async function hashPassword(password) {
 const salt = crypto.randomBytes(16).toString('hex');
 return salt+':'+(await scrypt(password,salt,64)).toString('hex');
}
export async function verifyPassword(password,stored) {
 if(typeof password!=='string'||password.length>128||!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored||'')) return false;
 const [salt,key]=stored.split(':');
 return crypto.timingSafeEqual(Buffer.from(key,'hex'),await scrypt(password,salt,64));
}
export function publicUser(u) { return {id:u.id,full_name:u.full_name,email:u.email,role:u.role,hotel_name:u.hotel_name,property_id:u.hotel_owner_id||u.id}; }
export async function generateToken(user,db=pool) {
 const sid=crypto.randomUUID();
 await db.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[sid,user.id]);
 return jwt.sign({id:user.id,sid},secret,{expiresIn:'8h',algorithm:'HS256'});
}
export async function requireAuth(req,res,next) {
 let token;
 try { token=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),secret,{algorithms:['HS256']}); }
 catch { return res.status(401).json({error:'Please sign in again.'}); }
const UUID_REGEX=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!Number.isInteger(token.id)||typeof token.sid!=='string'||!UUID_REGEX.test(token.sid)) return res.status(401).json({error:'Invalid session.'});
 try {
  const {rows}=await pool.query('SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND u.id=$2 AND s.expires_at>now()',[token.sid,token.id]);
  if(!rows[0]) return res.status(401).json({error:'Session expired or revoked.'});
  req.user=publicUser(rows[0]); req.sessionId=token.sid; next();
 } catch(e) { next(e); }
}
export function optionalAuth(req,res,next) { return req.headers.authorization ? requireAuth(req,res,next) : next(); }
export function requireAdmin(req,res,next) { return req.user?.role==='admin' ? next() : res.status(403).json({error:'Hotel staff access required.'}); }

