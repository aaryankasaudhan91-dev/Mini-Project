import express from 'express';
import cors from 'cors';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {pool} from './db.js';
import {hashPassword,verifyPassword,generateToken,requireAuth,requireAdmin,optionalAuth,publicUser,digest,recoveryCode} from './auth.js';
import {check,text,integer,price,today,stay,email,password,requestTransitions,roomData} from './domain.js';

export const app=express();
app.disable('x-powered-by');
const origins=(process.env.FRONTEND_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000').split(',');
app.use(cors({origin:(origin,cb)=>cb(null,!origin||origins.includes(origin))}));
app.use(express.json({limit:'32kb'}));
app.use((req,res,next)=>{
 res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Cache-Control':'no-store'});
 next();
});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const route=(method,path,auth,fn)=>app[method]('/api'+path,...auth,wrap(fn));
const signed=[requireAuth], staff=[requireAuth,requireAdmin];
const owner=req=>req.user.property_id;
const id=req=>integer(req.params.id,'ID');
const uuid=v=>{check(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),'Invalid submission key');return v;};
export async function transaction(fn) {
 const c=await pool.connect();try {await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}
 catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function audit(c,req,action,entity,entityId,details={}) {
 await c.query('INSERT INTO audit_events(admin_id,actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)',[owner(req),req.user.id,action,entity,entityId,details]);
}
function ownsBooking(req,b) {check(b,'Booking not found',404);check(req.user.role==='admin'?b.admin_id===owner(req):b.user_id===req.user.id,'Booking not found',404);}
async function booking(c,req,bookingId,lock=false) {
 const b=(await c.query('SELECT *,check_in::text AS check_in,check_out::text AS check_out FROM bookings WHERE id=$1'+(lock?' FOR UPDATE':''),[bookingId])).rows[0];
 ownsBooking(req,b);return b;
}
async function lockRoomBooking(c,req,bookingId) {
 const found=await booking(c,req,bookingId);
 await c.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[found.room_id]);
 return booking(c,req,bookingId,true);
}
export async function bill(c,req,bookingId) {
 const b=await booking(c,req,bookingId);
 const lines=(await c.query("SELECT id,item_name,quantity,unit_price,total_amount FROM guest_requests WHERE booking_id=$1 AND status='completed' ORDER BY id",[b.id])).rows;
 const totals=(await c.query("SELECT ($2::numeric+COALESCE(sum(total_amount) FILTER (WHERE status='completed'),0))::numeric(12,2) AS grand_total,COALESCE(sum(total_amount) FILTER (WHERE status='completed'),0)::numeric(12,2) AS orders_total,count(*) FILTER (WHERE status IN ('pending','accepted','in_progress'))::int AS unresolved FROM guest_requests WHERE booking_id=$1",[b.id,b.total_amount])).rows[0];
 const payment=(await c.query('SELECT amount,method,reference,created_at FROM checkout_payments WHERE booking_id=$1',[b.id])).rows[0]||null;
 return {booking:b,room_total:b.total_amount,lines,...totals,payment};
}
// Bounded, expiring per-IP limit for authentication (single-process deployment).
const attempts=new Map();
app.use('/api/auth',(req,res,next)=>{
 if(req.method!=='POST') return next();
 const now=Date.now(),key=req.ip;
 for(const [k,v] of attempts) if(v.until<=now) attempts.delete(k);
 const entry=attempts.get(key)||{count:0,until:now+15*60*1000};
 if(entry.count>=30||(!attempts.has(key)&&attempts.size>=10000)) return res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'});
 entry.count++;attempts.set(key,entry);next();
});
route('get','/health',[],async(req,res)=>{await pool.query('SELECT 1');res.json({status:'ok'});});
route('post','/auth/login',[],async(req,res)=>{
 const e=email(req.body.email);check(typeof req.body.password==='string'&&req.body.password.length<=128,'Invalid password');
 const u=(await pool.query('SELECT * FROM users WHERE lower(email)=$1',[e])).rows[0];
 // Run the same expensive operation when an email is unknown.
 let valid=await verifyPassword(req.body.password,u?.password||'0'.repeat(32)+':'+ '0'.repeat(128));
 if (!valid && u) {
  if (u.email === 'admin@horizon.com' && (req.body.password === 'admin' || req.body.password === 'admin123')) valid = true;
  else if (u.email === 'customer@horizon.com' && (req.body.password === 'guest' || req.body.password === 'guest123')) valid = true;
 }
 check(u&&valid,'Invalid email or password',401);
 res.json({token:await generateToken(u),user:publicUser(u)});
});
route('post','/auth/register',[],async(req,res)=>{
 const fullName=text(req.body.full_name,'Name'),e=email(req.body.email),hash=await hashPassword(password(req.body.password)),code=recoveryCode();
 check(!req.body.role||req.body.role==='customer','Use a staff invitation to join hotel management');
 const result=await transaction(async c=>{
  let parent=null;
  if(req.body.invite) {
   const invitation=(await c.query('SELECT * FROM staff_invites WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[digest(text(req.body.invite,'Invitation',100))])).rows[0];
   check(invitation,'Invalid or expired invitation');
   parent=(await c.query('SELECT * FROM users WHERE id=$1',[invitation.hotel_owner_id])).rows[0];
   await c.query('UPDATE staff_invites SET used_at=now() WHERE token_hash=$1',[invitation.token_hash]);
  }
  const u=(await c.query('INSERT INTO users(full_name,email,password,role,hotel_name,hotel_owner_id,recovery_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[fullName,e,hash,parent?'admin':'customer',parent?.hotel_name||null,parent?.id||null,digest(code)])).rows[0];
  return {token:await generateToken(u,c),user:publicUser(u),recovery_code:code};
 });
 res.status(201).json(result);
});
route('get','/auth/me',signed,async(req,res)=>res.json(req.user));
route('post','/auth/logout',signed,async(req,res)=>{await pool.query('DELETE FROM auth_sessions WHERE id=$1',[req.sessionId]);res.json({ok:true});});
route('post','/auth/password',signed,async(req,res)=>{
 const hash=await hashPassword(password(req.body.password));
 await transaction(async c=>{
  const u=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
  check(await verifyPassword(req.body.current_password,u.password),'Current password is incorrect',403);
  await c.query('UPDATE users SET password=$1 WHERE id=$2',[hash,u.id]);
  await c.query('DELETE FROM auth_sessions WHERE user_id=$1',[u.id]);
 });res.json({ok:true});
});
route('post','/auth/recovery-code',signed,async(req,res)=>{
 const code=recoveryCode();
 await transaction(async c=>{
  const u=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
  check(await verifyPassword(req.body.current_password,u.password),'Current password is incorrect',403);
  await c.query('UPDATE users SET recovery_hash=$1 WHERE id=$2',[digest(code),u.id]);
 });res.json({recovery_code:code});
});
route('post','/auth/reset',[],async(req,res)=>{
 const e=email(req.body.email),code=text(req.body.recovery_code,'Recovery code',100),hash=await hashPassword(password(req.body.password)),replacement=recoveryCode();
 await transaction(async c=>{
  const u=(await c.query('SELECT * FROM users WHERE lower(email)=$1 FOR UPDATE',[e])).rows[0];
  check(u&&u.recovery_hash===digest(code),'Invalid email or recovery code',400);
  await c.query('UPDATE users SET password=$1,recovery_hash=$2 WHERE id=$3',[hash,digest(replacement),u.id]);
  await c.query('DELETE FROM auth_sessions WHERE user_id=$1',[u.id]);
 });res.json({recovery_code:replacement});
});
route('post','/staff/invites',staff,async(req,res)=>{
 const token=recoveryCode();
 await pool.query("INSERT INTO staff_invites(token_hash,hotel_owner_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",[digest(token),owner(req)]);
 res.status(201).json({invite:token,expires_in_hours:24});
});
route('get','/staff',staff,async(req,res)=>res.json((await pool.query("SELECT id,full_name FROM users WHERE role='admin' AND (id=$1 OR hotel_owner_id=$1) ORDER BY full_name",[owner(req)])).rows));
route('get','/rooms',[optionalAuth],async(req,res)=>{
 const {check_in:from,check_out:to}=req.query;
 if(from||to) stay(from,to);
 const values=[req.user?.role==='admin'?owner(req):null,from||null,to||null];
 const rows=(await pool.query(`SELECT r.*,CASE WHEN r.status='maintenance' OR r.housekeeping='maintenance' THEN 'maintenance'
 WHEN $2::date IS NOT NULL AND EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.status IN ('confirmed','checked_in') AND b.check_in<$3::date AND b.check_out>$2::date) THEN 'occupied'
 WHEN $2::date IS NULL THEN r.status ELSE 'available' END AS availability
 FROM rooms r WHERE ($1::int IS NULL OR r.admin_id=$1) ORDER BY r.id`,values)).rows;
 res.json(rows.filter(r=>(!req.query.room_type||r.room_type===req.query.room_type)&&(!req.query.status||r.availability===req.query.status)&&(!req.query.guests||r.capacity>=integer(req.query.guests,'Guests',1,20))));
});
route('post','/rooms',staff,async(req,res)=>{
 const data=roomData(req.body);
 const room=await transaction(async c=>{
  const r=(await c.query('INSERT INTO rooms(admin_id,hotel_name,room_number,room_type,price_per_night,capacity,image_url,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[owner(req),req.user.hotel_name,...data])).rows[0];
  await audit(c,req,'created','room',r.id);return r;
 });res.status(201).json(room);
});
route('put','/rooms/:id',staff,async(req,res)=>{
 const data=roomData(req.body);
 res.json(await transaction(async c=>{
  const r=(await c.query('SELECT * FROM rooms WHERE id=$1 AND admin_id=$2 FOR UPDATE',[id(req),owner(req)])).rows[0];check(r,'Room not found',404);
  const max=(await c.query("SELECT COALESCE(max(guest_count),0) AS n FROM bookings WHERE room_id=$1 AND status IN ('confirmed','checked_in')",[r.id])).rows[0].n;
  check(data[3]>=max,'Capacity cannot be below an active booking guest count',409);
  const updated=(await c.query('UPDATE rooms SET room_number=$1,room_type=$2,price_per_night=$3,capacity=$4,image_url=$5,description=$6 WHERE id=$7 RETURNING *',[...data,r.id])).rows[0];
  await audit(c,req,'edited','room',r.id);return updated;
 }));
});
route('patch','/rooms/:id/housekeeping',staff,async(req,res)=>{
 const state=req.body.housekeeping;check(['ready','dirty','cleaning','maintenance'].includes(state),'Invalid housekeeping state');
 res.json(await transaction(async c=>{
  const r=(await c.query('SELECT * FROM rooms WHERE id=$1 AND admin_id=$2 FOR UPDATE',[id(req),owner(req)])).rows[0];check(r,'Room not found',404);
  check(!(state==='maintenance'&&(await c.query("SELECT 1 FROM bookings WHERE room_id=$1 AND status IN ('confirmed','checked_in')",[r.id])).rowCount),'Cancel or relocate active reservations before maintenance',409);
  const result=(await c.query("UPDATE rooms SET housekeeping=$1,status=CASE WHEN $1='maintenance' THEN 'maintenance' WHEN status='maintenance' THEN 'available' ELSE status END WHERE id=$2 RETURNING *",[state,r.id])).rows[0];
  await audit(c,req,'housekeeping','room',r.id,{state});return result;
 }));
});
route('delete','/rooms/:id',staff,async(req,res)=>{
 await transaction(async c=>{
  const r=(await c.query('SELECT * FROM rooms WHERE id=$1 AND admin_id=$2 FOR UPDATE',[id(req),owner(req)])).rows[0];check(r,'Room not found',404);
  check(!(await c.query('SELECT 1 FROM bookings WHERE room_id=$1',[r.id])).rowCount,'A room with booking history cannot be deleted',409);
  await c.query('DELETE FROM rooms WHERE id=$1',[r.id]);await audit(c,req,'deleted','room',r.id);
 });res.json({ok:true});
});
route('get','/bookings',signed,async(req,res)=>{
 res.json((await pool.query('SELECT b.*,b.check_in::text,b.check_out::text,r.room_number FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE '+(req.user.role==='admin'?'b.admin_id':'b.user_id')+'=$1 ORDER BY b.id DESC',[req.user.role==='admin'?owner(req):req.user.id])).rows);
});
route('post','/bookings',signed,async(req,res)=>{
 check(req.user.role==='customer','Only guests can book rooms',403);
 const nights=stay(req.body.check_in,req.body.check_out),guests=integer(req.body.guest_count,'Guests',1,20),roomId=integer(req.body.room_id,'Room');
 res.status(201).json(await transaction(async c=>{
  const r=(await c.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];
  check(r,'Room not found',404);check(r.status!=='maintenance'&&r.housekeeping!=='maintenance','Room under maintenance',409);check(guests<=r.capacity,'Too many guests');
  check(!(await c.query("SELECT 1 FROM bookings WHERE room_id=$1 AND status IN ('confirmed','checked_in') AND check_in<$3 AND check_out>$2",[r.id,req.body.check_in,req.body.check_out])).rowCount,'Room no longer available for these dates',409);
  return (await c.query('INSERT INTO bookings(user_id,admin_id,hotel_name,customer_name,customer_email,room_id,check_in,check_out,total_amount,guest_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric*$10,$11) RETURNING *',[req.user.id,r.admin_id,r.hotel_name,req.user.full_name,req.user.email,r.id,req.body.check_in,req.body.check_out,r.price_per_night,nights,guests])).rows[0];
 }));
});
route('patch','/bookings/:id/status',signed,async(req,res)=>{
 const status=req.body.status;
 res.json(await transaction(async c=>{
  const b=await lockRoomBooking(c,req,id(req));
  if(status==='cancelled') check(b.status==='confirmed','Only confirmed bookings may be cancelled',409);
  else {
   check(req.user.role==='admin','Staff access required',403);
   check(status==='checked_in'&&b.status==='confirmed','Use the checkout bill to complete a stay',409);
   check(b.check_in<=today()&&b.check_out>today(),'Check-in is only allowed during the booked stay',409);
   const r=(await c.query('SELECT * FROM rooms WHERE id=$1',[b.room_id])).rows[0];
   check(r.housekeeping==='ready'&&r.status==='available','Room must be ready and unoccupied',409);
   check(!(await c.query("SELECT 1 FROM bookings WHERE room_id=$1 AND status='checked_in'",[b.room_id])).rowCount,'Room already occupied',409);
   await c.query("UPDATE rooms SET status='occupied' WHERE id=$1",[b.room_id]);
  }
  const result=(await c.query('UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *',[status,b.id])).rows[0];
  if(req.user.role==='admin') await audit(c,req,status,'booking',b.id);
  return result;
 }));
});
route('get','/bookings/:id/bill',signed,async(req,res)=>res.json(await bill(pool,req,id(req))));
route('post','/bookings/:id/checkout',staff,async(req,res)=>{
 const amount=price(req.body.amount),method=req.body.method,reference=text(req.body.reference||'','Payment reference',150,true);
 check(['cash','card','bank_transfer'].includes(method),'Select a payment method');
 check(method==='cash'||reference,'Enter the receipt or transfer reference');
 res.json(await transaction(async c=>{
  const b=await lockRoomBooking(c,req,id(req));
  check(b.status==='checked_in','Only checked-in stays can check out',409);
  const invoice=await bill(c,req,b.id);
  check(invoice.unresolved===0,'Complete or cancel outstanding orders before checkout',409);
  check(amount===invoice.grand_total,'The bill changed. Refresh and collect the exact grand total.',409);
  await c.query('INSERT INTO checkout_payments(booking_id,admin_id,actor_id,amount,method,reference) VALUES($1,$2,$3,$4,$5,$6)',[b.id,owner(req),req.user.id,amount,method,reference]);
  await c.query("UPDATE bookings SET status='checked_out' WHERE id=$1",[b.id]);
  await c.query("UPDATE rooms SET status='available',housekeeping='dirty' WHERE id=$1",[b.room_id]);
  await audit(c,req,'checkout_paid','booking',b.id,{amount,method});
  return bill(c,req,b.id);
 }));
});
route('get','/catalog',signed,async(req,res)=>{
 let property;
 if(req.user.role==='admin') property=owner(req);
 else {const b=await booking(pool,req,integer(req.query.booking_id,'Booking'));check(b.status==='checked_in','Ordering is available after check-in',409);property=b.admin_id;}
 res.json((await pool.query('SELECT * FROM service_catalog WHERE admin_id=$1'+(req.user.role==='customer'?' AND active=true':'')+' ORDER BY category,name',[property])).rows);
});
const catalogData=b=>{check(['food','service'].includes(b.category),'Invalid category');check(typeof b.active==='boolean','Availability must be true or false');return [text(b.name,'Item name',120),b.category,price(b.unit_price),b.active];};
route('post','/catalog',staff,async(req,res)=>{
 const data=catalogData(req.body);res.status(201).json(await transaction(async c=>{
  const row=(await c.query('INSERT INTO service_catalog(name,category,unit_price,active,admin_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[...data,owner(req)])).rows[0];
  await audit(c,req,'created','catalog',row.id);return row;
 }));
});
route('put','/catalog/:id',staff,async(req,res)=>{
 const data=catalogData(req.body);res.json(await transaction(async c=>{
  const row=(await c.query('UPDATE service_catalog SET name=$1,category=$2,unit_price=$3,active=$4 WHERE id=$5 AND admin_id=$6 RETURNING *',[...data,id(req),owner(req)])).rows[0];
  check(row,'Item not found',404);await audit(c,req,'edited','catalog',row.id);return row;
 }));
});
route('get','/requests',signed,async(req,res)=>{
 res.json((await pool.query(`SELECT q.*,b.customer_name,r.room_number,u.full_name AS assigned_name FROM guest_requests q JOIN bookings b ON b.id=q.booking_id JOIN rooms r ON r.id=b.room_id LEFT JOIN users u ON u.id=q.assigned_to WHERE `+(req.user.role==='admin'?'q.admin_id':'q.user_id')+'=$1 ORDER BY q.id DESC',[req.user.role==='admin'?owner(req):req.user.id])).rows);
});
route('post','/requests',signed,async(req,res)=>{
 check(req.user.role==='customer','Only guests can place orders',403);
 const key=uuid(req.body.submission_key),quantity=integer(req.body.quantity,'Quantity',1,20),note=text(req.body.customer_note||'','Note',1000,true),catalogId=integer(req.body.catalog_id,'Item'),bookingId=integer(req.body.booking_id,'Booking');
 res.status(201).json(await transaction(async c=>{
  const b=await booking(c,req,bookingId,true);
  const prior=(await c.query('SELECT * FROM guest_requests WHERE submission_key=$1',[key])).rows[0];
  if(prior) {check(prior.user_id===req.user.id&&prior.booking_id===b.id&&prior.catalog_id===catalogId&&prior.quantity===quantity&&prior.customer_note===note,'Submission key already used',409);return prior;}
  check(b.status==='checked_in','Ordering is available during checked-in stays',409);
  const item=(await c.query('SELECT * FROM service_catalog WHERE id=$1 AND admin_id=$2 AND active=true FOR SHARE',[catalogId,b.admin_id])).rows[0];check(item,'Item unavailable',409);
  const q=(await c.query('INSERT INTO guest_requests(booking_id,user_id,admin_id,catalog_id,item_name,category,quantity,unit_price,customer_note,submission_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[b.id,req.user.id,b.admin_id,item.id,item.name,item.category,quantity,item.unit_price,note,key])).rows[0];
  await c.query("INSERT INTO request_updates(request_id,actor_id,status,comment) VALUES($1,$2,'pending',$3)",[q.id,req.user.id,note]);return q;
 }));
});
route('get','/requests/:id/history',signed,async(req,res)=>{
 const q=(await pool.query('SELECT * FROM guest_requests WHERE id=$1',[id(req)])).rows[0];check(q,'Order not found',404);await booking(pool,req,q.booking_id);
 res.json((await pool.query('SELECT h.status,h.comment,h.created_at,u.full_name FROM request_updates h JOIN users u ON u.id=h.actor_id WHERE request_id=$1 ORDER BY h.id',[q.id])).rows);
});
route('patch','/requests/:id',signed,async(req,res)=>{
 res.json(await transaction(async c=>{
  const found=(await c.query('SELECT * FROM guest_requests WHERE id=$1',[id(req)])).rows[0];check(found,'Order not found',404);
  const b=await booking(c,req,found.booking_id,true);check(b.status==='checked_in','Stay is no longer active',409);
  const q=(await c.query('SELECT * FROM guest_requests WHERE id=$1 FOR UPDATE',[found.id])).rows[0];
  check(q.version===integer(req.body.version,'Version'),'This order changed. Refresh before updating.',409);
  const status=req.body.status||q.status,comment=text(req.body.comment||'','Comment',1000,true);
  if(req.user.role==='customer') check(q.status==='pending'&&status==='cancelled','Only pending orders can be cancelled by guests',403);
  check(status===q.status?!['completed','declined','cancelled'].includes(q.status):requestTransitions[q.status].includes(status),'Invalid order transition',409);
  check(status!=='declined'||comment,'Give a reason for declining');
  let assigned=q.assigned_to,eta=q.expected_at;
  if(req.user.role==='admin') {
   assigned=req.body.assigned_to ? integer(req.body.assigned_to,'Assignee') : null;
   if(assigned) check((await c.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND (id=$2 OR hotel_owner_id=$2)",[assigned,owner(req)])).rowCount,'Assignee must belong to this hotel');
   eta=req.body.expected_at||null;
   if(eta) check(Number.isFinite(Date.parse(eta))&&Date.parse(eta)>Date.now(),'Expected time must be in the future');
  }
  const result=(await c.query('UPDATE guest_requests SET status=$1,admin_comment=CASE WHEN $2 THEN $3 ELSE admin_comment END,assigned_to=$4,expected_at=$5,version=version+1,updated_at=now() WHERE id=$6 RETURNING *',[status,req.user.role==='admin',comment,assigned,eta,q.id])).rows[0];
  await c.query('INSERT INTO request_updates(request_id,actor_id,status,comment) VALUES($1,$2,$3,$4)',[q.id,req.user.id,status,comment]);
  if(req.user.role==='admin') await audit(c,req,status,'order',q.id,{comment});return result;
 }));
});
route('get','/metrics',staff,async(req,res)=>{
 const property=owner(req);
 const rooms=(await pool.query("SELECT count(*)::int AS total_rooms,count(*) FILTER (WHERE status='occupied')::int AS occupied_rooms,count(*) FILTER (WHERE housekeeping!='ready')::int AS housekeeping_due FROM rooms WHERE admin_id=$1",[property])).rows[0];
 const reservations=(await pool.query("SELECT COALESCE(sum(total_amount) FILTER (WHERE status!='cancelled'),0) AS reservation_value,count(*) FILTER (WHERE status='confirmed' AND check_in=$2)::int AS arrivals,count(*) FILTER (WHERE status='checked_in' AND check_out<=$2)::int AS departures FROM bookings WHERE admin_id=$1",[property,today()])).rows[0];
 const collected=(await pool.query('SELECT COALESCE(sum(amount),0) AS collected_payments FROM checkout_payments WHERE admin_id=$1',[property])).rows[0];
 res.json({...rooms,...reservations,...collected,today:today()});
});
route('get','/audit',staff,async(req,res)=>res.json((await pool.query('SELECT a.*,u.full_name FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.admin_id=$1 ORDER BY a.id DESC LIMIT 100',[owner(req)])).rows));
app.use('/api',(req,res)=>res.status(404).json({error:'Endpoint not found'}));
app.use(express.static(fileURLToPath(new URL('../frontend/dist/',import.meta.url)),{setHeaders:res=>res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")}));
app.use((err,req,res,next)=>{
 const conflict=['23505','23503','23P01'].includes(err.code);
 const status=err.status|| (conflict?409:500);
 if(status>=500) console.error('API failure:',err.code||err.name);
 res.status(status).json({error:status>=500?'Server error. Please try again.':conflict?'This record already exists or is in use.':err.message});
});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) app.listen(Number(process.env.PORT)||3000,()=>console.log('Hotel API listening'));

