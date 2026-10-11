import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

test('Real PostgreSQL hotel workflow, permissions and billing',{skip:process.env.HMS_INTEGRATION_TESTS!=='1'},async t=>{
 process.env.JWT_SECRET='integration-only-secret-over-32-characters';
 const {app}=await import('../server.js');
 const {pool}=await import('../db.js');
 const {hashPassword,generateToken}=await import('../auth.js');
 const {today}=await import('../domain.js');
 const schema='hms_test_'+crypto.randomBytes(8).toString('hex');
 const admin=new pg.Client(pool.options);await admin.connect();await admin.query('CREATE SCHEMA "'+schema+'"');
 pool.options.options='-c search_path='+schema;
 let server;
 t.after(async()=>{if(server)await new Promise(r=>server.close(r));await pool.end();assert.match(schema,/^hms_test_[a-f0-9]{16}$/);try{await admin.query('DROP SCHEMA "'+schema+'" CASCADE');}finally{await admin.end();}});
 await pool.query(fs.readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
 await pool.query(fs.readFileSync(new URL('../database/migrations/001_operations.sql',import.meta.url),'utf8'));
 const hashed=await hashPassword('ValidPassword123');
 const users=(await pool.query("INSERT INTO users(full_name,email,password,role,hotel_name) VALUES ('Owner','owner@test.local',$1,'admin','Hotel'),('Other','other@test.local',$1,'admin','Hotel'),('Guest','guest@test.local',$1,'customer',NULL),('Stranger','stranger@test.local',$1,'customer',NULL) RETURNING *",[hashed])).rows;
 const [owner,other,guest,stranger]=users;
 const tokens={};for(const u of users)tokens[u.id]=await generateToken(u);
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 async function req(method,path,user,body){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user.id]}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 const roomData={room_number:'101',room_type:'Standard',price_per_night:'100.25',capacity:2,description:'Real test room'};
 let room,b,item,order;
 const from=today(),to=new Date(Date.parse(from)+86400000).toISOString().slice(0,10);
 await t.test('unauthenticated and customer writes are denied',async()=>{
  assert.equal((await req('POST','/rooms',null,roomData)).status,401);
  assert.equal((await req('POST','/rooms',guest,roomData)).status,403);
  assert.equal((await req('POST','/auth/register',null,{full_name:'Bad',email:'bad@test.local',password:'ValidPassword123',role:'admin'})).status,400);
 });
 await t.test('room creation and owner isolation even for same hotel name',async()=>{
  const r=await req('POST','/rooms',owner,roomData);assert.equal(r.status,201);room=r.body;
  assert.deepEqual((await req('GET','/rooms',other)).body,[]);
  assert.equal((await req('PUT','/rooms/'+room.id,other,roomData)).status,404);
  assert.equal((await req('POST','/rooms',owner,roomData)).status,409);
 });
 await t.test('strict dates, capacity and price validation',async()=>{
  for(const dates of [{check_in:'2020-01-01',check_out:to},{check_in:from+'T00:00:00Z',check_out:to},{check_in:from,check_out:from}]){
   assert.equal((await req('POST','/bookings',guest,{room_id:room.id,guest_count:1,...dates})).status,400);
  }
  assert.equal((await req('POST','/bookings',guest,{room_id:room.id,guest_count:3,check_in:from,check_out:to})).status,400);
  assert.equal((await req('POST','/rooms',owner,{...roomData,price_per_night:'-1'})).status,400);
 });
 await t.test('concurrent reservations produce one booking and authoritative total',async()=>{
  const payload={room_id:room.id,guest_count:2,check_in:from,check_out:to,total_amount:1};
  const results=await Promise.all([req('POST','/bookings',guest,payload),req('POST','/bookings',guest,payload)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);b=results.find(r=>r.status===201).body;
  assert.equal(b.total_amount,'100.25');assert.equal(b.guest_count,2);
  assert.equal((await req('GET','/rooms?check_in='+from+'&check_out='+to)).body[0].availability,'occupied');
 });
 await t.test('ownership applies to bill, bookings, catalog and checkout',async()=>{
  assert.deepEqual((await req('GET','/bookings',other)).body,[]);
  for(const actor of [other,stranger]){
   assert.equal((await req('GET','/bookings/'+b.id+'/bill',actor)).status,404);
   assert.equal((await req('PATCH','/bookings/'+b.id+'/status',actor,{status:'cancelled'})).status,404);
  }
  assert.equal((await req('POST','/bookings/'+b.id+'/checkout',guest,{amount:'100.25',method:'cash'})).status,403);
 });
 await t.test('housekeeping gates check-in and active reservations prevent maintenance',async()=>{
  assert.equal((await req('PATCH','/rooms/'+room.id+'/housekeeping',owner,{housekeeping:'maintenance'})).status,409);
  await req('PATCH','/rooms/'+room.id+'/housekeeping',owner,{housekeeping:'dirty'});
  assert.equal((await req('PATCH','/bookings/'+b.id+'/status',owner,{status:'checked_in'})).status,409);
  await req('PATCH','/rooms/'+room.id+'/housekeeping',owner,{housekeeping:'ready'});
  assert.equal((await req('PATCH','/bookings/'+b.id+'/status',owner,{status:'checked_in'})).status,200);
  assert.equal((await req('GET','/metrics',owner)).body.occupied_rooms,1);
 });
 await t.test('catalog is real, isolated and validated',async()=>{
  assert.deepEqual((await req('GET','/catalog?booking_id='+b.id,guest)).body,[]);
  const result=await req('POST','/catalog',owner,{name:'Lunch',category:'food',unit_price:'50.10',active:true});
  assert.equal(result.status,201);item=result.body;
  assert.deepEqual((await req('GET','/catalog',other)).body,[]);
  assert.equal((await req('GET','/catalog?booking_id='+b.id,stranger)).status,404);
 });
 await t.test('orders snapshot price, prevent duplicates and reject tampering',async()=>{
  const body={booking_id:b.id,catalog_id:item.id,quantity:2,customer_note:'No chilli',submission_key:crypto.randomUUID(),unit_price:0};
  const results=await Promise.all([req('POST','/requests',guest,body),req('POST','/requests',guest,body)]);
  assert.ok(results.every(r=>r.status===201));assert.equal(results[0].body.id,results[1].body.id);order=results[0].body;
  assert.equal(order.total_amount,'100.20');
  assert.equal((await req('POST','/requests',guest,{...body,quantity:3})).status,409);
  await req('PUT','/catalog/'+item.id,owner,{name:'Lunch',category:'food',unit_price:'90.00',active:true});
  assert.equal((await req('GET','/requests',guest)).body[0].unit_price,'50.10');
  assert.equal((await req('PATCH','/requests/'+order.id,other,{status:'accepted',version:1})).status,404);
 });
 await t.test('checkout cannot bypass unresolved orders or direct status route',async()=>{
  assert.equal((await req('POST','/bookings/'+b.id+'/checkout',owner,{amount:'100.25',method:'cash'})).status,409);
  assert.equal((await req('PATCH','/bookings/'+b.id+'/status',owner,{status:'checked_out'})).status,409);
 });
 await t.test('staff transition validation, required decline reason and stale version',async()=>{
  assert.equal((await req('PATCH','/requests/'+order.id,owner,{status:'completed',version:1})).status,409);
  assert.equal((await req('PATCH','/requests/'+order.id,owner,{status:'declined',version:1})).status,400);
  let result=await req('PATCH','/requests/'+order.id,owner,{status:'accepted',version:1,comment:'Preparing',assigned_to:owner.id});
  assert.equal(result.status,200);
  assert.equal((await req('PATCH','/requests/'+order.id,owner,{status:'in_progress',version:1})).status,409);
  assert.equal((await req('PATCH','/requests/'+order.id,guest,{status:'cancelled',version:2})).status,403);
  result=await req('PATCH','/requests/'+order.id,owner,{status:'in_progress',version:2});
  assert.equal(result.status,200);
  result=await req('PATCH','/requests/'+order.id,owner,{status:'completed',version:3});assert.equal(result.status,200);
  assert.equal((await req('PATCH','/requests/'+order.id,owner,{status:'completed',version:4,comment:'Changed'})).status,409);
 });
 await t.test('declined and cancelled orders never add charges',async()=>{
  for(const state of ['declined','cancelled']){
   const q=(await req('POST','/requests',guest,{booking_id:b.id,catalog_id:item.id,quantity:1,submission_key:crypto.randomUUID()})).body;
   assert.equal((await req('PATCH','/requests/'+q.id,state==='cancelled'?guest:owner,{status:state,version:1,comment:'Unavailable'})).status,200);
  }
  const invoice=(await req('GET','/bookings/'+b.id+'/bill',guest)).body;
  assert.equal(invoice.grand_total,'200.45');assert.equal(invoice.lines.length,1);assert.equal(invoice.unresolved,0);assert.equal(invoice.payment,null);
 });
 await t.test('payment amount and method are validated',async()=>{
  assert.equal((await req('POST','/bookings/'+b.id+'/checkout',owner,{amount:'100.25',method:'cash'})).status,409);
  assert.equal((await req('POST','/bookings/'+b.id+'/checkout',owner,{amount:'200.45',method:'card'})).status,400);
 });
 await t.test('database failure rolls back payment, checkout and housekeeping together',async()=>{
  await pool.query("CREATE FUNCTION reject_checkout() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END $$; CREATE TRIGGER reject_room BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION reject_checkout()");
  assert.equal((await req('POST','/bookings/'+b.id+'/checkout',owner,{amount:'200.45',method:'cash'})).status,500);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_payments')).rows[0].n,0);
  assert.equal((await pool.query('SELECT status FROM bookings WHERE id=$1',[b.id])).rows[0].status,'checked_in');
  await pool.query('DROP TRIGGER reject_room ON rooms');
 });
 await t.test('concurrent checkout records exactly one grand total payment',async()=>{
  const results=await Promise.all([req('POST','/bookings/'+b.id+'/checkout',owner,{amount:'200.45',method:'cash'}),req('POST','/bookings/'+b.id+'/checkout',owner,{amount:'200.45',method:'cash'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const invoice=(await req('GET','/bookings/'+b.id+'/bill',guest)).body;
  assert.equal(invoice.payment.amount,'200.45');assert.equal(invoice.booking.status,'checked_out');
  const r=(await req('GET','/rooms',owner)).body[0];assert.equal(r.status,'available');assert.equal(r.housekeeping,'dirty');
  const m=(await req('GET','/metrics',owner)).body;assert.equal(m.collected_payments,'200.45');assert.equal(m.occupied_rooms,0);
  assert.equal((await req('POST','/requests',guest,{booking_id:b.id,catalog_id:item.id,quantity:1,submission_key:crypto.randomUUID()})).status,409);
 });
 await t.test('audit and request history have persistent scoped entries',async()=>{
  assert.ok((await req('GET','/audit',owner)).body.some(e=>e.action==='checkout_paid'));
  assert.deepEqual((await req('GET','/audit',other)).body,[]);
  assert.equal((await req('GET','/requests/'+order.id+'/history',guest)).body.length,4);
  assert.equal((await req('GET','/requests/'+order.id+'/history',stranger)).status,404);
 });
 await t.test('staff invitation is single-use and joins only the issuing hotel',async()=>{
  const invitation=(await req('POST','/staff/invites',owner,{})).body.invite;
  const payload={full_name:'New staff',email:'staff@test.local',password:'ValidPassword123',invite:invitation};
  const result=await req('POST','/auth/register',null,payload);assert.equal(result.status,201);assert.equal(result.body.user.property_id,owner.id);assert.equal(result.body.user.role,'admin');
  assert.equal((await req('POST','/auth/register',null,{...payload,email:'second@test.local'})).status,400);
 });
 await t.test('password recovery consumes code and revokes existing sessions',async()=>{
  const code=(await req('POST','/auth/recovery-code',guest,{current_password:'ValidPassword123'})).body.recovery_code;
  const result=await req('POST','/auth/reset',null,{email:guest.email,recovery_code:code,password:'ReplacementPass123'});
  assert.equal(result.status,200);assert.ok(result.body.recovery_code);
  assert.equal((await req('GET','/auth/me',guest)).status,401);
  assert.equal((await req('POST','/auth/reset',null,{email:guest.email,recovery_code:code,password:'ReplacementPass123'})).status,400);
  const login=await req('POST','/auth/login',null,{email:guest.email,password:'ReplacementPass123'});assert.equal(login.status,200);
  tokens[guest.id]=login.body.token;
  assert.equal((await req('POST','/auth/logout',guest)).status,200);
  assert.equal((await req('GET','/auth/me',guest)).status,401);
 });
});

