export function notify(message) {
 const n=document.createElement('div');n.className='notice';n.textContent=String(message);
 document.getElementById('notices').append(n);setTimeout(()=>n.remove(),6500);
}
