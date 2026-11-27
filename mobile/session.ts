import {createClient,processLock,type Session} from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
const size=1000;
const storageLimit=32;
type Pointer={id:string;count:number};
function pointer(value:string|null):Pointer|null{
  if(!value) return null;
  try{
    const row=JSON.parse(value);
    return typeof row.id==='string'&&/^[a-z0-9-]+$/.test(row.id)&&Number.isInteger(row.count)&&row.count>0&&row.count<=storageLimit?row:null;
  }catch{return null;}
}
const parts=(key:string,index:Pointer)=>Array.from({length:index.count},(_,part)=>key+'-'+index.id+'-'+part);
export const secureSessionStorage={
  async getItem(key:string){
    const index=pointer(await SecureStore.getItemAsync(key,options));
    if(!index) return null;
    const values=await Promise.all(parts(key,index).map(name=>SecureStore.getItemAsync(name,options)));
    return values.some(value=>value===null)?null:values.join('');
  },
  async setItem(key:string,value:string){
    const count=Math.ceil(value.length/size);
    if(count<1||count>storageLimit) throw new Error('The session exceeds secure storage limits.');
    const old=pointer(await SecureStore.getItemAsync(key,options));
    const index={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),count};
    const names=parts(key,index);
    try{
      await Promise.all(names.map((name,part)=>SecureStore.setItemAsync(name,value.slice(part*size,(part+1)*size),options)));
      await SecureStore.setItemAsync(key,JSON.stringify(index),options);
    }catch(error){
      await Promise.allSettled(names.map(name=>SecureStore.deleteItemAsync(name,options)));
      throw error;
    }
    if(old) await Promise.allSettled(parts(key,old).map(name=>SecureStore.deleteItemAsync(name,options)));
  },
  async removeItem(key:string){
    const index=pointer(await SecureStore.getItemAsync(key,options));
    await SecureStore.deleteItemAsync(key,options);
    if(index) await Promise.allSettled(parts(key,index).map(name=>SecureStore.deleteItemAsync(name,options)));
  },
};

const supabaseUrl=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storageKey='personalgymtrack-auth-session';
export const appUrl=process.env.EXPO_PUBLIC_PGT_URL?.replace(/\/$/,'')??'';
export const authRedirect='personalgymtrack://auth/confirm';
const developmentHosts=['localhost','127.0.0.1','10.0.2.2'];

export function validOrigin(input:string){
  try{
    const url=new URL(input);
    return url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash&&
      (url.protocol==='https:'||(__DEV__&&url.protocol==='http:'&&developmentHosts.includes(url.hostname)));
  }catch{return false;}
}
export const supabase=supabaseUrl&&validOrigin(supabaseUrl)&&key?.startsWith('sb_publishable_')?createClient(supabaseUrl,key,{
  auth:{storage:secureSessionStorage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,lock:processLock,flowType:'pkce'},
}):null;

export async function signOutLocal(){
  if(!supabase) return;
  try{await supabase.auth.signOut({scope:'local'});}
  catch{/* Secure storage can be cleared when the device is offline. */}
  finally{
    await secureSessionStorage.removeItem(storageKey);
    await secureSessionStorage.removeItem(storageKey+'-code-verifier');
  }
}

export async function consumeAuthLink(uri:string){
  const url=new URL(uri);
  if(url.protocol!=='personalgymtrack:'||url.hostname!=='auth'||url.pathname!=='/confirm'||url.hash||url.username||url.password||url.port) return null;
  const code=url.searchParams.get('code');
  if(!supabase||!code||!/^[A-Za-z0-9_-]{20,256}$/.test(code)) return null;
  const {error}=await supabase.auth.exchangeCodeForSession(code);
  if(error) throw new Error('The confirmation link is expired or unavailable.');
  return 'recovery';
}

export async function mobileRequest<T>(session:Session,path:string,command?:object,signal?:AbortSignal):Promise<T>{
  if(!validOrigin(appUrl)) throw new Error('Configure an HTTPS GymTrack workspace URL.');
  const response=await fetch(appUrl+path,{signal,cache:'no-store',redirect:'error',
    method:command?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(command?{'Content-Type':'application/json'}:{})},
    ...(command?{body:JSON.stringify(command)}:{}),
  });
  const body=await response.json();
  if(!response.ok) throw new Error(body.error??'The workspace is unavailable.');
  return body;
}
