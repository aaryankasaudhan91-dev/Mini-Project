import test from 'node:test';
import assert from 'node:assert/strict';
import {stay,today,price,date,roomData,integer} from '../domain.js';
import {hashPassword,verifyPassword} from '../auth.js';
test('calendar dates reject timestamps, invalid days and past stays',()=>{
 assert.throws(()=>date('2026-02-30'));assert.throws(()=>date('2026-01-01T00:00:00Z'));
 assert.throws(()=>stay('2000-01-01','2000-01-02'));
 const from=today(),to=new Date(Date.parse(from)+172800000).toISOString().slice(0,10);
 assert.equal(stay(from,to),2);
});
test('money and numeric fields reject malformed values',()=>{
 assert.equal(price('12.30'),'12.30');
 for(const v of [-1,'1.234','1e2','NaN',null])assert.throws(()=>price(v));
 assert.throws(()=>integer('', 'Guests'));assert.throws(()=>integer(true,'Guests'));
 assert.throws(()=>roomData({room_type:'Standard',room_number:'1',price_per_night:10,capacity:1,image_url:'javascript:alert(1)'}));
});
test('passwords use salted async hashes and no plaintext fallback',async()=>{
 const a=await hashPassword('a secure password'),b=await hashPassword('a secure password');
 assert.notEqual(a,b);assert.equal(await verifyPassword('a secure password',a),true);
 assert.equal(await verifyPassword('wrong',a),false);assert.equal(await verifyPassword('plain','plain'),false);
 assert.equal(await verifyPassword('a','malformed:hash'),false);
});
test('requireAuth rejects malformed and non-UUID session tokens',async()=>{
 const {requireAuth}=await import('../auth.js');
 const jwt=(await import('jsonwebtoken')).default;
 const res={status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
 await requireAuth({headers:{authorization:''}},res,()=>{});
 assert.equal(res.statusCode,401);
 const badToken=jwt.sign({id:1,sid:'not-a-uuid'},process.env.JWT_SECRET,{expiresIn:'1h',algorithm:'HS256'});
 await requireAuth({headers:{authorization:'Bearer '+badToken}},res,()=>{});
 assert.equal(res.statusCode,401);
 assert.equal(res.body.error,'Invalid session.');
});

