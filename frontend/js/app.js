import {api} from './api.js';
import {Store} from './store.js';
import {notify} from './notifications.js';

const main=document.getElementById('main'),dialog=document.getElementById('dialog');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(n));
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const when=v=>v?new Date(v).toLocaleString():'—';
const status=v=>'<span class="badge">'+escape(v.replaceAll('_',' '))+'</span>';
const button=(label,action,id='',extra='')=>'<button type="button" data-action="'+action+'" data-id="'+id+'" '+extra+'>'+escape(label)+'</button>';
const field=(label,name,type='text',value='',attrs='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+escape(value)+'" '+attrs+'></label>';
const select=(label,name,options,value='')=>'<label>'+label+'<select name="'+name+'">'+options.map(([v,l])=>'<option value="'+escape(v)+'" '+(String(value)===String(v)?'selected':'')+'>'+escape(l)+'</option>').join('')+'</select></label>';
const empty=message=>'<p class="empty">'+escape(message)+'</p>';
const table=(heads,rows)=>rows.length?'<div class="table-wrap"><table><thead><tr>'+heads.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':empty('No records yet.');
let user=Store.getUser(),revision=0,cache={},search={},queueFilter='all';
function route(){return location.hash.slice(1)||'home';}
function nav(){
 const current=route();
 const links=[['home','Home'],['rooms','Rooms']];
 if(user) links.push([user.role==='admin'?'admin':'guest',user.role==='admin'?'Management':'My stay'],['account','Account']);
 else links.push(['login','Sign in']);
 document.getElementById('nav').innerHTML=links.map(([r,l])=>'<a href="#'+r+'" '+(current===r?'aria-current="page"':'')+'>'+l+'</a>').join('')+(user?button('Sign out','logout','','class="secondary"'):'');
}
function modal(title,html,onSubmit) {
 dialog.innerHTML='<div class="row between"><h2 id="dialog-title">'+escape(title)+'</h2>'+button('Close','close','','class="secondary"')+'</div>'+html;
 dialog.onSubmit=null;
 dialog.onsubmit=async e=>{
  e.preventDefault();const form=e.target;if(!onSubmit||!form.reportValidity())return;
  const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=true;
  let error=form.querySelector('.error');if(error)error.textContent='';
  try{await onSubmit(Object.fromEntries(new FormData(form)),form);}
  catch(e){if(error)error.textContent=e.message;else notify(e.message);}
  finally{if(submit?.isConnected)submit.disabled=false;}
 };
 if(!dialog.open)dialog.showModal();
}
function formEnd(label){return '<p class="error" role="alert"></p><button type="submit">'+label+'</button></form>';}
function showCode(title,code){
 modal(title,'<p>Save this code privately. It is shown once. A replacement invalidates the previous code.</p><p class="code">'+escape(code)+'</p>'+button('Copy code','copy-code','','data-code="'+escape(code)+'"'));
}
function adminTabs(current) {
 return '<div class="row tabs">'+[['admin','Overview'],['inventory','Rooms & housekeeping'],['reservations','Reservations'],['queue','Orders & services'],['catalog','Menu & services'],['audit','Activity']].map(([r,l])=>'<a href="#'+r+'" '+(current===r?'aria-current="page"':'')+'>'+l+'</a>').join('')+'</div>';
}
async function render() {
 const version=++revision,r=route();nav();
 if(['admin','inventory','reservations','queue','catalog','audit'].includes(r)&&user?.role!=='admin'){location.hash='login';return;}
 if(['guest','account'].includes(r)&&!user){location.hash='login';return;}
 main.innerHTML='<p role="status">Loading…</p>';
 try{
  let html='';
  if(r==='home') html='<section class="hero"><div class="eyebrow">A comfortable stay, simply managed</div><h1>Your stay.<br>Your requests. One bill.</h1><p>Find a room for your dates. Once checked in, order food and hotel services from your guest portal. Follow staff updates and pay your combined bill at reception when you check out.</p><a class="button" href="#rooms">Find a room</a></section><div class="grid"><section class="card"><h2>Reserve</h2><p>Search real room availability and see the price before booking.</p></section><section class="card"><h2>Order during your stay</h2><p>Choose from the hotel’s available food and services. Staff can accept, decline, and comment on your requests.</p></section><section class="card"><h2>Pay at checkout</h2><p>Completed orders add to your room bill. Cancelled and declined orders carry no charge.</p></section></div>';
  else if(r==='login'||r==='register'||r==='reset') html=authPage(r);
  else if(r==='rooms') html=await roomsPage();
  else if(r==='guest') html=await guestPage();
  else if(r==='account') html=accountPage();
  else if(r==='privacy') html='<section class="panel narrow"><h1>Privacy & terms</h1><p>We store account details, reservations, order history, staff actions and checkout payment records in the hotel database. Your session token is kept in this browser tab and expires after eight hours. Signing out revokes it.</p><p>No marketing analytics or tracking cookies are used. Room charges use the full booked stay; food and service charges apply only to completed orders. Payment is collected and recorded by hotel staff at checkout. This website does not process card details or bank transfers.</p><p>Guests may cancel confirmed reservations and pending orders. Contact reception about accepted requests, incorrect bills, or personal-data enquiries. Keep your recovery code private. Hotel times use India Standard Time.</p></section>';
  else if(r==='admin') html=await dashboard();
  else if(r==='inventory') html=await inventory();
  else if(r==='reservations') html=await reservations();
  else if(r==='queue') html=await queue();
  else if(r==='catalog') html=await catalog();
  else if(r==='audit') html=await auditPage();
  else html='<h1>Page not found</h1><a href="#home">Return home</a>';
  if(version!==revision)return;
  main.innerHTML=html;bindForms();
 }catch(e){if(version===revision)main.innerHTML='<section class="panel"><h1>Unable to load this page</h1><p class="error">'+escape(e.message)+'</p>'+button('Retry','refresh')+'</section>';}
}
function authPage(r) {
 if(r==='reset')return '<section class="panel narrow"><h1>Recover account</h1><p>Use the private recovery code saved from your account. No email is sent.</p><form id="reset-form" class="stack">'+field('Email','email','email','','required autocomplete="email"')+field('Recovery code','recovery_code','text','','required maxlength="100"')+field('New password','password','password','','required minlength="10" maxlength="128" autocomplete="new-password"')+formEnd('Reset password')+'</section>';
 const register=r==='register';
 return '<section class="panel narrow"><div class="eyebrow">Welcome to Horizon</div><h1>'+ (register?'Create an account':'Sign in')+'</h1><form id="'+r+'-form" class="stack">'+(register?field('Full name','full_name','text','','required maxlength="100" autocomplete="name"'):'')+field('Email','email','email','','required maxlength="100" autocomplete="email"')+field('Password'+(register?' · at least 10 characters':''),'password','password','','required maxlength="128" autocomplete="'+(register?'new-password':'current-password')+'" '+(register?'minlength="10"':''))+(register?field('Staff invitation (optional)','invite','text','','maxlength="100"'):'')+formEnd(register?'Create account':'Sign in')+'<p><a href="#'+(register?'login':'register')+'">'+(register?'Already registered? Sign in':'Create guest account')+'</a> · <a href="#reset">Recover account</a></p>'+(register?'':'<hr><p class="muted">Academic demo accounts use the same live database.</p><div class="row">'+button('Fill guest demo','demo-guest','','class="secondary"')+button('Fill staff demo','demo-admin','','class="secondary"')+'</div>')+'</section>';
}
async function roomsPage(){
 const qs=new URLSearchParams(Object.entries(search).filter(([,v])=>v));
 cache.rooms=await api('/rooms?'+qs);
 return '<div class="eyebrow">Plan your stay</div><h1>Find your room</h1><form id="search-form" class="panel filters">'+field('Check-in','check_in','date',search.check_in||'','required min="'+day()+'"')+field('Check-out','check_out','date',search.check_out||'','required min="'+day()+'"')+field('Guests','guests','number',search.guests||1,'required min="1" max="20"')+select('Category','room_type',[['','All categories'],['Standard','Standard'],['Deluxe','Deluxe'],['Suite','Suite']],search.room_type)+select('Availability','status',[['','All inventory'],['available','Available'],['occupied','Unavailable'],['maintenance','Maintenance']],search.status)+'<button type="submit">Search</button>'+button('Clear dates','clear-dates','','class="secondary"')+'</form><p class="muted">Prices are per night. Select both dates to check availability for your stay.</p><div class="grid">'+(cache.rooms.length?cache.rooms.map(r=>'<article class="card">'+(r.image_url?'<img src="'+escape(r.image_url)+'" alt="'+escape(r.room_type)+' room" loading="lazy" referrerpolicy="no-referrer">':'')+'<div class="row between"><h2>'+escape(r.room_type)+' · '+escape(r.room_number)+'</h2>'+status(r.availability)+'</div><p>'+escape(r.hotel_name)+' · Up to '+r.capacity+' guests</p><p class="price">'+money(r.price_per_night)+' <small>/ night</small></p>'+button('Details & booking','room',r.id)+'</article>').join(''):empty('No rooms match. Hotel staff must add real rooms before they can be booked.'))+'</div>';
}
async function guestPage(){
 const [bookings,requests]=await Promise.all([api('/bookings'),api('/requests')]);cache.bookings=bookings;cache.requests=requests;
 return '<div class="row between"><div><div class="eyebrow">Guest portal</div><h1>Hello, '+escape(user.full_name)+'</h1></div><a class="button secondary" href="#rooms">Book another stay</a></div><section class="panel"><h2>Your stays</h2>'+table(['Stay','Dates','Status','Room total','Actions'],bookings.map(b=>'<tr><td>'+escape(b.hotel_name)+'<small>Booking #'+b.id+' · Room '+escape(b.room_number)+' · '+b.guest_count+' guests</small></td><td>'+escape(b.check_in)+' → '+escape(b.check_out)+'</td><td>'+status(b.status)+'</td><td>'+money(b.total_amount)+'</td><td>'+button('View bill','bill',b.id)+(b.status==='checked_in'?button('Order food / service','order',b.id):'')+(b.status==='confirmed'?button('Cancel booking','cancel-booking',b.id,'class="danger"'):'')+'</td></tr>'))+'</section><h2>Your food & service orders</h2><p class="muted">Completed orders show their status and price. Pay the combined grand total at checkout.</p><div class="grid">'+(requests.length?requests.map(q=>'<article class="card"><h3>'+escape(q.item_name)+'</h3><small>Order #'+q.id+' · Booking #'+q.booking_id+'</small><div class="row between"><p>'+status(q.status)+'</p><strong>'+money(q.total_amount)+'</strong></div>'+(q.status==='completed'?'':'<p>'+escape(q.admin_comment||'Awaiting the hotel’s next update.')+'</p>'+(q.expected_at?'<p>Expected: '+escape(when(q.expected_at))+'</p>':'')+button('Updates','history',q.id,'class="secondary"')+(q.status==='pending'?button('Cancel','cancel-order',q.id,'class="danger"'):''))+'</article>').join(''):empty('No food or service orders. You can place an order after check-in.'))+'</div>';
}
function accountPage(){
 return '<section class="panel narrow"><h1>Account security</h1><p>'+escape(user.full_name)+' · '+escape(user.email)+'</p><h2>Change password</h2><form id="password-form" class="stack">'+field('Current password','current_password','password','','required autocomplete="current-password"')+field('New password','password','password','','required minlength="10" maxlength="128" autocomplete="new-password"')+formEnd('Change password & sign out')+'<hr><h2>Recovery code</h2><p>Generate a private recovery code. It replaces any previous code and can reset your password if you forget it.</p><form id="recovery-form" class="stack">'+field('Current password','current_password','password','','required autocomplete="current-password"')+formEnd('Generate recovery code')+(user.role==='admin'?'<hr><h2>Invite staff</h2><p>Create a single-use invitation valid for 24 hours. Share it privately with a colleague to join your hotel.</p>'+button('Create invitation','invite'):'')+'</section>';
}
async function dashboard(){
 const [m,bookings]=await Promise.all([api('/metrics'),api('/bookings')]);cache.bookings=bookings;
 const arrivals=bookings.filter(b=>b.status==='confirmed'&&b.check_in===m.today),departures=bookings.filter(b=>b.status==='checked_in'&&b.check_out<=m.today);
 return adminTabs('admin')+'<div class="eyebrow">'+escape(user.hotel_name)+'</div><h1>Today at your hotel</h1><p class="muted">'+escape(m.today)+' · Actual database records</p><div class="stats">'+[['Rooms',m.total_rooms],['Occupied now',m.occupied_rooms],['Housekeeping due',m.housekeeping_due],['Collected payments',money(m.collected_payments)],['Room reservation value',money(m.reservation_value)]].map(([l,v])=>'<div class="stat"><strong>'+v+'</strong>'+l+'</div>').join('')+'</div><p class="muted">Reservation value includes unpaid stays. Collected payments count only recorded checkout bills.</p><section class="panel"><h2>Today’s arrivals</h2>'+bookingTable(arrivals)+'</section><section class="panel"><h2>Departures due</h2>'+bookingTable(departures)+'</section>';
}
function bookingTable(rows){
 return table(['Guest / room','Dates','Status','Room amount','Actions'],rows.map(b=>'<tr><td>'+escape(b.customer_name)+'<small>#'+b.id+' · Room '+escape(b.room_number)+' · '+b.guest_count+' guests</small></td><td>'+escape(b.check_in)+'<br>'+escape(b.check_out)+'</td><td>'+status(b.status)+'</td><td>'+money(b.total_amount)+'</td><td>'+button('Bill / checkout','bill',b.id)+(b.status==='confirmed'?button('Check in','check-in',b.id)+button('Cancel','cancel-booking',b.id,'class="danger"'):'')+'</td></tr>'));
}
async function reservations(){cache.bookings=await api('/bookings');return adminTabs('reservations')+'<h1>Reservations</h1><section class="panel">'+bookingTable(cache.bookings)+'</section>';}
async function inventory(){
 cache.rooms=await api('/rooms');
 return adminTabs('inventory')+'<div class="row between"><h1>Rooms & housekeeping</h1>'+button('Add room','add-room')+'</div>'+table(['Room','Category / capacity','Nightly rate','Occupancy','Housekeeping','Manage'],cache.rooms.map(r=>'<tr><td>'+escape(r.room_number)+'</td><td>'+escape(r.room_type)+' · '+r.capacity+'</td><td>'+money(r.price_per_night)+'</td><td>'+status(r.status)+'</td><td>'+status(r.housekeeping)+'</td><td>'+button('Edit','edit-room',r.id)+button('Housekeeping','housekeeping',r.id,'class="secondary"')+button('Delete','delete-room',r.id,'class="danger"')+'</td></tr>'));
}
async function catalog(){
 cache.catalog=await api('/catalog');
 return adminTabs('catalog')+'<div class="row between"><h1>Food & service catalog</h1>'+button('Add item','add-item')+'</div><p class="muted">Only available items can be ordered. Editing a price does not change previous orders.</p>'+table(['Item','Category','Unit price','Availability','Manage'],cache.catalog.map(i=>'<tr><td>'+escape(i.name)+'</td><td>'+escape(i.category)+'</td><td>'+money(i.unit_price)+'</td><td>'+status(i.active?'available':'unavailable')+'</td><td>'+button('Edit','edit-item',i.id)+'</td></tr>'));
}
async function queue(){
 const [requests,staff]=await Promise.all([api('/requests'),api('/staff')]);cache.requests=requests;cache.staff=staff;
 const rows=requests.filter(q=>queueFilter==='all'||q.status===queueFilter||q.category===queueFilter);
 return adminTabs('queue')+'<div class="row between"><h1>Orders & services</h1>'+select('Filter','queue-filter',['all','food','service','pending','accepted','in_progress','completed','declined','cancelled'].map(s=>[s,s.replaceAll('_',' ')]),queueFilter)+button('Refresh','refresh','','class="secondary"')+'</div>'+table(['Order / guest','Quantity / price','Status','Assignment','Actions'],rows.map(q=>'<tr><td>'+escape(q.item_name)+'<small>#'+q.id+' · '+escape(q.customer_name)+' · Room '+escape(q.room_number)+'</small><small>'+escape(q.customer_note)+'</small></td><td>'+q.quantity+' × '+money(q.unit_price)+'<small>'+money(q.total_amount)+'</small></td><td>'+status(q.status)+'<small>'+escape(q.admin_comment)+'</small></td><td>'+escape(q.assigned_name||'Unassigned')+'<small>'+escape(q.expected_at?when(q.expected_at):'No ETA')+'</small></td><td>'+(!['completed','declined','cancelled'].includes(q.status)?button('Review / update','review',q.id):'')+button('History','history',q.id,'class="secondary"')+'</td></tr>'));
}
async function auditPage(){
 const rows=await api('/audit');return adminTabs('audit')+'<h1>Activity log</h1><p class="muted">Most recent 100 staff actions.</p>'+table(['Time','Staff','Action','Record'],rows.map(a=>'<tr><td>'+escape(when(a.created_at))+'</td><td>'+escape(a.full_name)+'</td><td>'+escape(a.action.replaceAll('_',' '))+'</td><td>'+escape(a.entity)+' #'+a.entity_id+'</td></tr>'));
}
function bindForms(){
 const handlers={
 'login-form':async d=>{Store.setSession(await api('/auth/login',{method:'POST',body:d}));user=Store.getUser();location.hash=user.role==='admin'?'admin':'guest';},
 'register-form':async d=>{const result=await api('/auth/register',{method:'POST',body:d});Store.setSession(result);user=result.user;location.hash=user.role==='admin'?'admin':'guest';showCode('Save your recovery code',result.recovery_code);},
 'reset-form':async d=>{const result=await api('/auth/reset',{method:'POST',body:d});Store.clear();user=null;location.hash='login';showCode('Password reset · new recovery code',result.recovery_code);},
 'search-form':async d=>{if(d.check_out<=d.check_in)throw new Error('Check-out must be after check-in.');search=d;await render();},
 'password-form':async d=>{await api('/auth/password',{method:'POST',body:d});Store.clear();user=null;location.hash='login';notify('Password changed. Sign in again.');},
 'recovery-form':async d=>{const result=await api('/auth/recovery-code',{method:'POST',body:d});showCode('Save your recovery code',result.recovery_code);}
 };
 for(const [name,handler] of Object.entries(handlers)){
  const form=document.getElementById(name);if(!form)continue;
  form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const b=form.querySelector('[type=submit]');b.disabled=true;try{await handler(Object.fromEntries(new FormData(form)));}catch(e){const error=form.querySelector('.error');if(error)error.textContent=e.message;else notify(e.message);}finally{if(b.isConnected)b.disabled=false;}});
 }
 main.querySelector('[name="queue-filter"]')?.addEventListener('change',e=>{queueFilter=e.target.value;render();});
}
async function roomDetails(roomId){
 const r=cache.rooms.find(r=>r.id===roomId);if(!r)return;
 const context={...search};
 const canBook=user?.role==='customer'&&context.check_in&&context.check_out&&r.availability==='available';
 const nights=context.check_in&&context.check_out?(Date.parse(context.check_out)-Date.parse(context.check_in))/86400000:0;
 modal(r.room_type+' · '+r.room_number,'<p>'+escape(r.description||'No description provided.')+'</p><p>'+escape(r.hotel_name)+' · Capacity '+r.capacity+'</p><p class="price">'+money(r.price_per_night)+' / night</p>'+(canBook?'<form><p>'+escape(context.check_in)+' → '+escape(context.check_out)+' · '+nights+' nights · '+context.guests+' guests</p><p>Room total: <strong>'+money(Number(r.price_per_night)*nights)+'</strong></p><p>Food and service orders are added to your final checkout bill.</p>'+formEnd('Confirm reservation'):'<p>'+(!user?'<a href="#login" data-action="close">Sign in to book</a>':user.role==='admin'?'Use a guest account to make a reservation.':'Select dates and guests for an available room to book.')+'</p>'),async()=>{
  await api('/bookings',{method:'POST',body:{room_id:r.id,check_in:context.check_in,check_out:context.check_out,guest_count:context.guests}});
  dialog.close();location.hash='guest';notify('Room reserved. Payment is due at checkout.');
 });
}
function roomEditor(roomId){
 const r=cache.rooms?.find(r=>r.id===roomId)||{};
 modal(r.id?'Edit room':'Add room','<form class="stack">'+field('Room number','room_number','text',r.room_number||'','required maxlength="20"')+select('Category','room_type',['Standard','Deluxe','Suite'].map(v=>[v,v]),r.room_type)+field('Price per night (INR)','price_per_night','number',r.price_per_night||'','required min="0" step=".01" max="99999999.99"')+field('Guest capacity','capacity','number',r.capacity||1,'required min="1" max="20"')+field('Image URL (optional HTTPS)','image_url','url',r.image_url||'','maxlength="2000"')+'<label>Description<textarea name="description" maxlength="1000">'+escape(r.description||'')+'</textarea></label>'+formEnd('Save room'),async d=>{await api('/rooms'+(r.id?'/'+r.id:''),{method:r.id?'PUT':'POST',body:d});dialog.close();await render();notify('Room saved.');});
}
function itemEditor(itemId){
 const i=cache.catalog?.find(i=>i.id===itemId)||{active:true};
 modal(i.id?'Edit catalog item':'Add food or service','<form class="stack">'+field('Item name','name','text',i.name||'','required maxlength="120"')+select('Category','category',[['food','Food'],['service','Hotel service']],i.category)+field('Unit price (INR)','unit_price','number',i.unit_price||'','required min="0" step=".01"')+select('Availability','active',[['true','Available'],['false','Unavailable']],String(i.active))+formEnd('Save item'),async d=>{d.active=d.active==='true';await api('/catalog'+(i.id?'/'+i.id:''),{method:i.id?'PUT':'POST',body:d});dialog.close();await render();notify('Catalog updated.');});
}
async function orderForm(bookingId){
 const items=await api('/catalog?booking_id='+bookingId);
 if(!items.length){modal('Food & services',empty('The hotel has not made any items available yet. Please contact reception.'));return;}
 const key=crypto.randomUUID();
 modal('Order food or a hotel service','<form class="stack">'+select('Item','catalog_id',items.map(i=>[i.id,i.category+' · '+i.name+' · '+money(i.unit_price)]))+field('Quantity','quantity','number',1,'required min="1" max="20"')+'<label>Notes for staff<textarea name="customer_note" maxlength="1000" placeholder="Preferences or service details"></textarea></label><p>Staff will accept or decline your request. Only completed orders are charged, as part of your checkout grand total.</p>'+formEnd('Place order'),async d=>{await api('/requests',{method:'POST',body:{...d,booking_id:bookingId,submission_key:key}});dialog.close();await render();notify('Order sent to hotel staff.');});
}
function reviewOrder(orderId){
 const q=cache.requests.find(q=>q.id===orderId);
 const transitions={pending:['accepted','declined','cancelled'],accepted:['in_progress','cancelled'],in_progress:['completed']};
 modal('Review order #'+q.id,'<p>'+escape(q.item_name)+' · '+q.quantity+' · '+money(q.total_amount)+'</p><p>Guest note: '+escape(q.customer_note||'None')+'</p><form class="stack">'+select('Status','status',[q.status,...transitions[q.status]].map(s=>[s,s.replaceAll('_',' ')]),q.status)+select('Assign staff','assigned_to',[['','Unassigned'],...cache.staff.map(s=>[s.id,s.full_name])],q.assigned_to||'')+field('Expected time (optional; local time)','expected_at','datetime-local')+'<label>Comment / reason<textarea name="comment" maxlength="1000">'+escape(q.admin_comment||'')+'</textarea></label><p class="muted">Completing an order adds its price to the checkout bill and locks further changes.</p>'+formEnd('Save update'),async d=>{d.version=q.version;d.expected_at=d.expected_at?new Date(d.expected_at).toISOString():null;await api('/requests/'+q.id,{method:'PATCH',body:d});dialog.close();await render();notify('Order updated.');});
}
async function showBill(bookingId){
 const b=await api('/bookings/'+bookingId+'/bill');
 const checkout=user.role==='admin'&&b.booking.status==='checked_in';
 const html='<p>'+escape(b.booking.hotel_name)+' · Booking #'+bookingId+'</p><p>'+escape(b.booking.customer_name)+'<br>'+escape(b.booking.check_in)+' → '+escape(b.booking.check_out)+'</p>'+table(['Charge','Amount'],['<tr><td>Room stay (full reservation)</td><td>'+money(b.room_total)+'</td></tr>',...b.lines.map(l=>'<tr><td>'+escape(l.item_name)+' · '+l.quantity+' × '+money(l.unit_price)+'</td><td>'+money(l.total_amount)+'</td></tr>')])+'<div class="bill-total">Grand total <strong class="price">'+money(b.grand_total)+'</strong></div>'+(b.payment?'<p><strong>Paid at checkout</strong> · '+escape(b.payment.method)+' · '+escape(when(b.payment.created_at))+'</p><p>Reference: '+escape(b.payment.reference||'Cash receipt')+'</p>':'<p>Pay the grand total at reception when checking out. Pending, cancelled and declined orders are not charged.</p>')+(b.unresolved?'<p class="error">'+b.unresolved+' order(s) still open. Resolve these before collecting the final total.</p>':'')+button('Print bill','print','','class="secondary no-print"')+(checkout&&!b.unresolved?'<hr><form class="stack">'+select('Payment method','method',[['cash','Cash'],['card','Card (already collected)'],['bank_transfer','Bank transfer (already received)']])+field('Receipt / transfer reference (required for card or bank)','reference','text','','maxlength="150"')+'<label class="check"><input type="checkbox" required>I have received the full '+money(b.grand_total)+' from the guest.</label><p class="muted">This records payment received by reception; it does not charge a card or move money.</p>'+formEnd('Record full payment & check out'):'');
 modal(b.payment?'Paid checkout bill':'Checkout bill',html,async d=>{
  await api('/bookings/'+bookingId+'/checkout',{method:'POST',body:{...d,amount:b.grand_total}});
  dialog.close();await render();await showBill(bookingId);notify('Full payment recorded. Guest checked out.');
 });
}
async function confirmAction(title,message,work){
 modal(title,'<form><p>'+escape(message)+'</p>'+formEnd('Confirm'),async()=>{await work();dialog.close();await render();notify('Saved.');});
}
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el)return;
 const action=el.dataset.action,n=Number(el.dataset.id);el.disabled=true;
 try{
  if(action==='close')dialog.close();
  else if(action==='refresh')await render();
  else if(action==='logout'){await api('/auth/logout',{method:'POST'});Store.clear();user=null;dialog.close();location.hash='home';await render();}
  else if(action.startsWith('demo-')){const form=document.getElementById('login-form');form.elements.email.value=action==='demo-admin'?'admin@horizon.com':'customer@horizon.com';form.elements.password.value=action==='demo-admin'?'admin123':'guest123';}
  else if(action==='clear-dates'){search={...search,check_in:'',check_out:''};await render();}
  else if(action==='room')await roomDetails(n);
  else if(action==='add-room'||action==='edit-room')roomEditor(n);
  else if(action==='add-item'||action==='edit-item')itemEditor(n);
  else if(action==='order')await orderForm(n);
  else if(action==='review')reviewOrder(n);
  else if(action==='bill')await showBill(n);
  else if(action==='check-in')await confirmAction('Check in guest','Confirm the guest has arrived and the room is ready.',()=>api('/bookings/'+n+'/status',{method:'PATCH',body:{status:'checked_in'}}));
  else if(action==='cancel-booking')await confirmAction('Cancel reservation','Cancel this reservation and release its dates?',()=>api('/bookings/'+n+'/status',{method:'PATCH',body:{status:'cancelled'}}));
  else if(action==='cancel-order'){const q=cache.requests.find(q=>q.id===n);await confirmAction('Cancel order','Cancel this pending order?',()=>api('/requests/'+n,{method:'PATCH',body:{status:'cancelled',version:q.version}}));}
  else if(action==='delete-room')await confirmAction('Delete room','Delete this room? Rooms with booking history cannot be deleted.',()=>api('/rooms/'+n,{method:'DELETE'}));
  else if(action==='housekeeping'){const r=cache.rooms.find(r=>r.id===n);modal('Room '+r.room_number+' · housekeeping','<form class="stack">'+select('State','housekeeping',['ready','dirty','cleaning','maintenance'].map(s=>[s,s]),r.housekeeping)+formEnd('Update housekeeping'),async d=>{await api('/rooms/'+n+'/housekeeping',{method:'PATCH',body:d});dialog.close();await render();});}
  else if(action==='history'){const rows=await api('/requests/'+n+'/history');modal('Order #'+n+' · history',table(['When','Update','Comment'],rows.map(h=>'<tr><td>'+escape(when(h.created_at))+'<small>'+escape(h.full_name)+'</small></td><td>'+status(h.status)+'</td><td>'+escape(h.comment)+'</td></tr>')));}
  else if(action==='invite'){const result=await api('/staff/invites',{method:'POST'});showCode('Staff invitation · expires in 24 hours',result.invite);}
  else if(action==='copy-code'){await navigator.clipboard.writeText(el.dataset.code);notify('Code copied.');}
  else if(action==='print')window.print();
 }catch(e){notify(e.message);}
 finally{if(el.isConnected)el.disabled=false;}
});
window.addEventListener('hashchange',render);
window.addEventListener('session-expired',()=>{user=null;dialog.close();if(route()!=='login')location.hash='login';nav();});
let pollBusy=false;
setInterval(async()=>{
 if(pollBusy||document.hidden||dialog.open||!user||!['guest','admin','queue'].includes(route()))return;
 pollBusy=true;try{await render();}finally{pollBusy=false;}
},30000);
async function start(){
 if(Store.getToken()){try{user=await api('/auth/me');}catch{Store.clear();user=null;}}
 await render();
}
start();

