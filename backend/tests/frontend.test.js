import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('booking modal preserves the last searched stay, not edited form values', async () => {
  const elements = new Map();
  for (const id of ['spa-booking-modal','spa-modal-summary','spa-modal-checkin','spa-modal-checkout','cust-category','cust-checkin','cust-checkout','customer-available-grid']) {
    elements.set(id,{value:'',innerHTML:'',showModal(){this.open=true}});
  }
  elements.get('cust-checkin').value='2030-02-10';
  elements.get('cust-checkout').value='2030-02-15';
  const room={id:7,room_number:'101',room_type:'Suite',price_per_night:100,hotel_name:'Hotel'};
  const context=vm.createContext({
    window:{location:{hash:'#customer'},addEventListener(){}},
    document:{getElementById:id=>elements.get(id)||null,addEventListener(){}},
    Store:{getCurrentUser:()=>({full_name:'Guest',email:'g@example.test'})},
    Api:{getRooms:async()=>[room]},DEMO_CREDENTIALS:{},alert(){throw new Error('Unexpected alert');}
  });
  const source=fs.readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('export function updateAuthHeader','function updateAuthHeader');
  vm.runInContext(source,context);
  await vm.runInContext('searchCustomerRooms()',context);
  elements.get('cust-checkin').value='2031-01-01';
  context.window.triggerBookingModalById(7);
  assert.equal(elements.get('spa-modal-checkin').value,'2030-02-10');
  assert.equal(elements.get('spa-modal-checkout').value,'2030-02-15');
  assert.equal(elements.get('spa-booking-modal').open,true);
  context.window.location.hash='#rooms';
  context.window.triggerBookingModalById(7);
  assert.equal(elements.get('spa-modal-checkin').value,new Date().toISOString().split('T')[0]);
});
