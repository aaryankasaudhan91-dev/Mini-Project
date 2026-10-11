import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('notification renders untrusted text as text, never HTML',()=>{
 const appended=[];const doc={createElement:()=>({remove(){}}),getElementById:()=>({append:n=>appended.push(n)})};
 const code=fs.readFileSync(new URL('../../frontend/js/notifications.js',import.meta.url),'utf8').replace('export function','function');
 vm.runInNewContext(code+';notify("<img src=x onerror=alert(1)>")',{document:doc,setTimeout:()=>{}});
 assert.equal(appended[0].textContent,'<img src=x onerror=alert(1)>');assert.equal(appended[0].innerHTML,undefined);
});
test('session store discards legacy persistent tokens and uses tab storage',()=>{
 const removed=[],data=new Map();
 const code=fs.readFileSync(new URL('../../frontend/js/store.js',import.meta.url),'utf8').replace('export const Store','const Store');
 vm.runInNewContext(code+';Store.setSession({token:"token",user:{id:1}});if(Store.getUser().id!==1)throw Error("bad user");Store.clear();',{
 localStorage:{removeItem:k=>removed.push(k)},sessionStorage:{setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k),removeItem:k=>data.delete(k)}
 });
 assert.equal(data.size,0);assert.deepEqual(removed,['hms_token','hms_session']);
});

