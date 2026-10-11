export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function check(condition, message, status = 400) { if (!condition) throw new HttpError(status, message); }
export function text(value, label, max = 100, optional = false) {
  check(typeof value === 'string', `${label} must be text`);
  const result = value.trim();
  check((optional || result.length > 0) && result.length <= max, `${label} must contain ${optional ? '0' : '1'}–${max} characters`);
  return result;
}
export function integer(value, label, min = 1, max = 2147483647) {
  check((typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '', `${label} is required`);
  const n = Number(value); check(Number.isInteger(n) && n >= min && n <= max, `${label} must be ${min}–${max}`); return n;
}
export function price(value) {
  check(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(String(value)), 'Price must be a non-negative amount with at most two decimal places');
  return Number(value).toFixed(2);
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {timeZone:process.env.HOTEL_TIMEZONE || 'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
export function date(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Dates must use YYYY-MM-DD');
  const parsed = new Date(`${value}T00:00:00Z`);
  check(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value, 'Invalid calendar date'); return value;
}
export function stay(checkIn, checkOut, allowPast = false) {
  date(checkIn); date(checkOut);
  check(checkOut > checkIn, 'Check-out must be after check-in');
  check(allowPast || checkIn >= today(), 'Check-in cannot be in the past');
  const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
  check(nights <= 365, 'A stay cannot exceed 365 nights'); return nights;
}
export function email(value) { const e = text(value, 'Email', 100).toLowerCase(); check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 'Enter a valid email'); return e; }
export function password(value) { check(typeof value === 'string' && value.length >= 4 && value.length <= 128, 'Password must contain at least 4 characters'); return value; }
export const requestTransitions = {pending:['accepted','declined','cancelled'],accepted:['in_progress','cancelled'],in_progress:['completed'],completed:[],declined:[],cancelled:[]};
export function roomData(body) {
  const type = text(body.room_type, 'Category'); check(['Standard','Deluxe','Suite'].includes(type), 'Invalid room category');
  const url = text(body.image_url || '', 'Image URL', 2000, true);
  if (url) { let parsed; try { parsed = new URL(url); } catch { throw new HttpError(400,'Enter a valid image URL'); } check(parsed.protocol === 'https:', 'Images must use HTTPS'); }
  return [text(body.room_number,'Room number',20),type,price(body.price_per_night),integer(body.capacity,'Capacity',1,20),url,text(body.description || '', 'Description',1000,true)];
}
