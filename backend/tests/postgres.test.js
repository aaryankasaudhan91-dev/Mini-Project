import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

const enabled = process.env.HMS_INTEGRATION_TESTS === '1';
test('PostgreSQL integration (isolated schema)', { skip: !enabled }, async t => {
  process.env.JWT_SECRET = 'integration-test-secret-with-at-least-32-characters';
  const { app } = await import('../server.js');
  const { pool } = await import('../db.js');
  const { generateToken } = await import('../auth.js');
  const schema = `hms_review_test_${crypto.randomBytes(8).toString('hex')}`;
  const adminClient = new pg.Client(pool.options);
  await adminClient.connect();
  await adminClient.query(`CREATE SCHEMA "${schema}"`);
  pool.options.options = `-c search_path=${schema}`;
  t.after(async () => {
    await pool.end();
    assert.match(schema, /^hms_review_test_[a-f0-9]{16}$/);
    try { await adminClient.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await adminClient.end(); }
  });
  const sql = fs.readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8').replace(/^DROP TABLE.*;\r?\n/gm, '');
  await pool.query(sql);
  const users = await pool.query(`INSERT INTO users (full_name,email,password,role,hotel_name) VALUES
    ('Owner','owner@test.local','unused','admin','Same Hotel'),
    ('Other Owner','other@test.local','unused','admin','Same Hotel'),
    ('Guest','guest@test.local','unused','customer',NULL)
    RETURNING *`);
  const [owner, other, guest] = users.rows;
  const room = (await pool.query(`INSERT INTO rooms (admin_id,hotel_name,room_number,room_type,price_per_night,capacity)
    VALUES ($1,'Same Hotel','101','Standard',100,2) RETURNING *`, [owner.id])).rows[0];
  async function request(method, path, user, body = {}, params = {}) {
    const route=app._router.stack.find(layer=>layer.route?.path===path && layer.route.methods[method]).route;
    const req={headers:{authorization:`Bearer ${generateToken(user)}`},body,params,query:{}};
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    for(const layer of route.stack){let next=false;await layer.handle(req,res,()=>{next=true});if(!next)break;}
    return res;
  }
  const dates = (await pool.query(`SELECT (CURRENT_DATE + 10)::text AS start, (CURRENT_DATE + 12)::text AS finish`)).rows[0];
  const payload={roomId:room.id,checkIn:dates.start,checkOut:dates.finish};
  let firstBooking;
  await t.test('concurrent overlapping creates result in exactly one reservation',async()=>{
    const results=await Promise.all([request('post','/api/bookings',guest,payload),request('post','/api/bookings',guest,payload)]);
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,409]);
    firstBooking=results.find(r=>r.statusCode===201).body;
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM bookings')).rows[0].count,1);
  });
  await t.test('same-name owner has no management access',async()=>{
    assert.deepEqual((await request('get','/api/bookings',other)).body,[]);
    assert.deepEqual((await request('get','/api/rooms',other)).body,[]);
    assert.equal((await request('patch','/api/rooms/:id/status',other,{status:'maintenance'},{id:room.id})).statusCode,403);
    assert.equal((await request('patch','/api/bookings/:id/status',other,{status:'cancelled'},{id:firstBooking.id})).statusCode,403);
    assert.equal((await request('get','/api/metrics',other)).body.totalRooms,0);
  });
  await t.test('cancel then rebook prevents restoration into overlapping dates',async()=>{
    assert.equal((await request('patch','/api/bookings/:id/status',guest,{status:'cancelled'},{id:firstBooking.id})).statusCode,200);
    const replacement=await request('post','/api/bookings',guest,payload);
    assert.equal(replacement.statusCode,201);
    assert.equal((await request('patch','/api/bookings/:id/status',owner,{status:'confirmed'},{id:firstBooking.id})).statusCode,409);
    await request('patch','/api/bookings/:id/status',guest,{status:'cancelled'},{id:replacement.body.id});
    assert.equal((await request('patch','/api/bookings/:id/status',owner,{status:'confirmed'},{id:firstBooking.id})).statusCode,200);
  });
  await t.test('future confirmed stays do not count toward todays occupancy',async()=>{
    const res=await request('get','/api/metrics',owner);
    assert.equal(res.body.activeBookings,1);
    assert.equal(res.body.occupancyRate,0);
    await pool.query(`INSERT INTO bookings(user_id,admin_id,hotel_name,customer_name,customer_email,room_id,check_in,check_out,total_amount)
      VALUES($1,$2,'Same Hotel','Guest','guest@test.local',$3,CURRENT_DATE,CURRENT_DATE+1,100)`,[guest.id,owner.id,room.id]);
    assert.equal((await request('get','/api/metrics',owner)).body.occupancyRate,100);
  });
  await t.test('room update failure rolls back the booking update in PostgreSQL',async()=>{
    await pool.query(`CREATE FUNCTION reject_room_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Simulated room write failure'; END $$;
      CREATE TRIGGER reject_update BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION reject_room_update()`);
    t.mock.method(console,'error',()=>{});
    const res=await request('patch','/api/bookings/:id/status',owner,{status:'checked_in'},{id:firstBooking.id});
    assert.equal(res.statusCode,500);
    const stored=(await pool.query('SELECT status FROM bookings WHERE id=$1',[firstBooking.id])).rows[0];
    assert.equal(stored.status,'confirmed');
    await pool.query('DROP TRIGGER reject_update ON rooms');
  });
  await t.test('checkout updates the booking and room atomically',async()=>{
    assert.equal((await request('patch','/api/bookings/:id/status',owner,{status:'checked_in'},{id:firstBooking.id})).statusCode,200);
    assert.equal((await pool.query('SELECT status FROM rooms WHERE id=$1',[room.id])).rows[0].status,'occupied');
    assert.equal((await request('patch','/api/bookings/:id/status',owner,{status:'checked_out'},{id:firstBooking.id})).statusCode,200);
    assert.equal((await pool.query('SELECT status FROM rooms WHERE id=$1',[room.id])).rows[0].status,'available');
  });
});
