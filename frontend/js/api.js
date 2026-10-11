import {Store} from './store.js';
const configured=import.meta.env.VITE_API_URL||import.meta.env.VITE_API_BASE_URL;
const base=(configured||'/api').replace(/\/$/,'');
export async function api(path,{method='GET',body}={}) {
 const headers={Accept:'application/json'};if(body!==undefined) headers['Content-Type']='application/json';
 if(Store.getToken()) headers.Authorization='Bearer '+Store.getToken();
 let response;
 try{response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
 catch(e){throw new Error(e.name==='TimeoutError'?'The request timed out. Refresh before retrying an action.':'Cannot reach the hotel server. Check your connection.');}
 const data=await response.json().catch(()=>({error:'Unexpected server response'}));
 if(!response.ok){if(response.status===401){Store.clear();window.dispatchEvent(new Event('session-expired'));}const e=new Error(data.error||'Request failed');e.status=response.status;throw e;}
 return data;
}
