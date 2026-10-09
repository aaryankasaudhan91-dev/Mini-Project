import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'regression-test-secret-with-at-least-32-characters';
const { app } = await import('../server.js');
const { pool } = await import('../db.js');
const { generateToken, verifyPassword } = await import('../auth.js');
const admin = { id: 1, role: 'admin', hotel_name: 'Shared Name', full_name: 'Owner' };
const guest = { id: 3, role: 'customer', full_name: 'Guest', email: 'guest@example.test' };
const room = { id: 7, admin_id: 1, hotel_name: 'Shared Name', status: 'available', price_per_night: '100.00' };
const booking = { id: 9, room_id: 7, admin_id: 1, user_id: 3, status: 'confirmed', check_in: '2030-01-10', check_out: '2030-01-12' };

async function request(method, path, { user = admin, token, body = {}, params = {}, query = {} } = {}) {
  const route = app._router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { headers: {}, body, params, query };
  if (token || user) req.headers.authorization = `Bearer ${token || generateToken(user)}`;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  for (const layer of route.stack) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) break;
  }
  return res;
}

function transaction(t, { initial = booking, targetRoom = room, conflict = false, failRoomWrite = false, failRollback = false } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql === 'ROLLBACK' && failRollback) throw new Error('Rollback unavailable');
      if (sql.startsWith('SELECT * FROM bookings')) return { rows: initial ? [{ ...initial }] : [] };
      if (sql.startsWith('SELECT * FROM rooms')) return { rows: targetRoom ? [{ ...targetRoom }] : [] };
      if (sql.includes("AND status IN ('confirmed', 'checked_in')")) return { rows: conflict ? [{ id: 10 }] : [] };
      if (sql.startsWith('UPDATE bookings')) return { rows: [{ ...initial, status: args[0] }] };
      if (sql.startsWith('UPDATE rooms') && failRoomWrite) throw new Error('Room write failed');
      if (sql.includes('INSERT INTO bookings')) return { rows: [{ ...booking, total_amount: args[8] }] };
      return { rows: [] };
    },
    release() { released = true; }
  };
  t.mock.method(pool, 'connect', async () => client);
  t.mock.method(console, 'error', () => {});
  return { calls, get released() { return released; } };
}

test('startup rejects empty and known fallback JWT secrets', () => {
  for (const secret of ['', 'hms-secure-jwt-secret-key-2026-production']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import './backend/auth.js'"], {
      cwd: new URL('../../', import.meta.url), env: { ...process.env, JWT_SECRET: secret }, encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Configure JWT_SECRET/);
  }
});

test('known fallback token is rejected by protected endpoints', async () => {
  const token = jwt.sign(admin, 'hms-secure-jwt-secret-key-2026-production');
  const res = await request('get', '/api/bookings', { token });
  assert.equal(res.statusCode, 401);
});

test('unsigned access and unknown signed roles are rejected', async () => {
  assert.equal((await request('get', '/api/bookings', { user: null })).statusCode, 401);
  const token = jwt.sign({ id: 1, role: 'other' }, process.env.JWT_SECRET);
  assert.equal((await request('patch', '/api/bookings/:id/status', { token })).statusCode, 401);
});

test('malformed password hashes fail authentication without throwing', () => {
  assert.equal(verifyPassword('password', 'salt:bad'), false);
});

test('same hotel name never grants another owner room or booking access', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, args) => { calls.push({sql, args}); return {rows: []}; });
  const other = { ...admin, id: 2 };
  await request('get', '/api/rooms', { user: other, query: { hotelName: 'Shared Name' } });
  await request('get', '/api/bookings', { user: other });
  assert.match(calls[0].sql, /r\.admin_id = \$1/);
  assert.match(calls[1].sql, /b\.admin_id = \$1/);
  assert.deepEqual(calls.map(c => c.args), [[2], [2]]);
});

test('same-name owner cannot change or delete another owners room', async t => {
  t.mock.method(pool, 'query', async sql => {
    assert.match(sql, /^SELECT admin_id/);
    return {rows: [{admin_id: 1}]};
  });
  for (const method of ['patch', 'delete']) {
    const path = method === 'patch' ? '/api/rooms/:id/status' : '/api/rooms/:id';
    assert.equal((await request(method, path, { user: {...admin,id:2}, params:{id:'7'}, body:{status:'maintenance'} })).statusCode,403);
  }
});

test('customer booking list is filtered by customer ID', async t => {
  t.mock.method(pool, 'query', async (sql, args) => {
    assert.match(sql, /b\.user_id = \$1/); assert.deepEqual(args,[3]); return {rows:[]};
  });
  assert.equal((await request('get','/api/bookings',{user:guest})).statusCode,200);
});

test('restoring a cancelled booking rejects an overlapping active reservation', async t => {
  const tx = transaction(t, { initial: {...booking,status:'cancelled'}, conflict:true });
  const res = await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'confirmed'}});
  assert.equal(res.statusCode,409);
  assert.equal(tx.calls.at(-1).sql,'ROLLBACK');
  assert.ok(!tx.calls.some(c=>c.sql.startsWith('UPDATE')));
  assert.deepEqual(tx.calls.find(c=>c.sql.includes('AND check_in <')).args,[7,9,'2030-01-12','2030-01-10']);
  assert.ok(tx.released);
});

test('nonoverlapping restoration updates both records under the room lock', async t => {
  const tx = transaction(t,{initial:{...booking,status:'cancelled'}});
  const res = await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'confirmed'}});
  assert.equal(res.statusCode,200);
  const statements = tx.calls.map(c=>c.sql);
  assert.ok(statements.findIndex(s=>s.startsWith('SELECT * FROM rooms')) < statements.findIndex(s=>s.includes('bookings WHERE id = $1 FOR UPDATE')));
  assert.ok(statements.some(s=>s.startsWith('UPDATE rooms')));
  assert.equal(statements.at(-1),'COMMIT');
  assert.ok(tx.released);
});

test('room write failure rolls back reservation status and releases connection', async t => {
  const tx=transaction(t,{failRoomWrite:true});
  const res=await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'checked_in'}});
  assert.equal(res.statusCode,500);
  assert.equal(tx.calls.at(-1).sql,'ROLLBACK');
  assert.ok(!tx.calls.some(c=>c.sql==='COMMIT'));
  assert.ok(tx.released);
});

test('rollback failure still releases connection and returns a controlled error',async t=>{
  const tx=transaction(t,{failRoomWrite:true,failRollback:true});
  assert.equal((await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'checked_in'}})).statusCode,500);
  assert.ok(tx.released);
});

test('checked-out bookings cannot be reopened', async t=>{
  const tx=transaction(t,{initial:{...booking,status:'checked_out'}});
  assert.equal((await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'confirmed'}})).statusCode,409);
  assert.ok(!tx.calls.some(c=>c.sql.startsWith('UPDATE')));
});

test('customer cannot cancel a checked-in stay', async t=>{
  transaction(t,{initial:{...booking,status:'checked_in'}});
  assert.equal((await request('patch','/api/bookings/:id/status',{user:guest,params:{id:'9'},body:{status:'cancelled'}})).statusCode,409);
});

test('customer cannot cancel someone elses reservation',async t=>{
  transaction(t);
  assert.equal((await request('patch','/api/bookings/:id/status',{user:{...guest,id:4},params:{id:'9'},body:{status:'cancelled'}})).statusCode,403);
});

test('same-name administrator cannot update another owners reservation', async t=>{
  transaction(t);
  assert.equal((await request('patch','/api/bookings/:id/status',{user:{...admin,id:2},params:{id:'9'},body:{status:'cancelled'}})).statusCode,403);
});

test('room maintenance blocks reservation activation',async t=>{
  transaction(t,{initial:{...booking,status:'cancelled'},targetRoom:{...room,status:'maintenance'}});
  assert.equal((await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'confirmed'}})).statusCode,409);
});

test('connection acquisition failure is handled by both booking routes',async t=>{
  t.mock.method(pool,'connect',async()=>{throw new Error('Database offline')});
  t.mock.method(console,'error',()=>{});
  assert.equal((await request('post','/api/bookings',{user:guest,body:{roomId:7,checkIn:'2030-01-10',checkOut:'2030-01-12'}})).statusCode,500);
  assert.equal((await request('patch','/api/bookings/:id/status',{params:{id:'9'},body:{status:'cancelled'}})).statusCode,500);
});

test('booking creation locks room, computes amount and commits',async t=>{
  const tx=transaction(t);
  const res=await request('post','/api/bookings',{user:guest,body:{roomId:7,checkIn:'2030-01-10',checkOut:'2030-01-12'}});
  assert.equal(res.statusCode,201);
  assert.equal(res.body.total_amount,200);
  assert.match(tx.calls[1].sql,/rooms WHERE id = \$1 FOR UPDATE/);
  assert.equal(tx.calls.at(-1).sql,'COMMIT');
  assert.ok(tx.released);
});

test('booking creation rejects overlaps without inserting',async t=>{
  const tx=transaction(t,{conflict:true});
  // Conflict response includes dates returned from PostgreSQL.
  const original = pool.connect;
  const client = await original();
  const query = client.query;
  client.query=async(sql,args)=> {
    const result=await query(sql,args);
    if(sql.includes('SELECT id, customer_name')) result.rows=[{id:10,check_in:'2030-01-10',check_out:'2030-01-12'}];
    return result;
  };
  const res=await request('post','/api/bookings',{user:guest,body:{roomId:7,checkIn:'2030-01-10',checkOut:'2030-01-12'}});
  assert.equal(res.statusCode,409);
  assert.ok(!tx.calls.some(c=>c.sql.includes('INSERT INTO bookings')));
});

test('occupancy uses distinct rooms overlapping today, scoped to administrator',async t=>{
  t.mock.method(pool,'query',async(sql,args)=>{
    assert.deepEqual(args,[1]);
    assert.match(sql,/admin_id = \$1/);
    if(sql.includes('COUNT(DISTINCT room_id)')) {
      assert.match(sql,/check_in <= CURRENT_DATE AND check_out > CURRENT_DATE/);
      return {rows:[{count:'2'}]};
    }
    if(sql.includes('FROM rooms')) return {rows:[{count:'5'}]};
    if(sql.includes('SUM(total_amount)')) return {rows:[{revenue:'800'}]};
    return {rows:[{count:'20'}]};
  });
  const res=await request('get','/api/metrics');
  assert.equal(res.body.activeBookings,20);
  assert.equal(res.body.occupiedRooms,2);
  assert.equal(res.body.occupancyRate,40);
});
