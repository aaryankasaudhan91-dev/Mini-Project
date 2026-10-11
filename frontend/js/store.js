const TOKEN='hms_session_token',USER='hms_session_user';
// Discard legacy persistent sessions; credentials are never persisted.
localStorage.removeItem('hms_token');localStorage.removeItem('hms_session');
export const Store={
 getToken:()=>sessionStorage.getItem(TOKEN),
 getUser:()=>{try{return JSON.parse(sessionStorage.getItem(USER)||'null');}catch{return null;}},
 setSession:({token,user})=>{sessionStorage.setItem(TOKEN,token);sessionStorage.setItem(USER,JSON.stringify(user));},
 clear:()=>{sessionStorage.removeItem(TOKEN);sessionStorage.removeItem(USER);}
};
