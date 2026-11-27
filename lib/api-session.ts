import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {config,db} from './supabase';

export function privateJson(data:unknown,status=200){
  return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization, Cookie'}});
}

export async function apiSession(request:Request){
  const connection=config();
  if(!connection) return {response:privateJson({error:'Workspace setup is required.'},503)} as const;
  const authorization=request.headers.get('authorization');
  const bearer=authorization?.match(/^Bearer ([A-Za-z0-9_.-]{20,8192})$/i)?.[1];
  if(authorization!==null&&!bearer) return {response:privateJson({error:'Sign in required.'},401)} as const;
  if(!bearer && request.method!=='GET' && request.headers.get('sec-fetch-site')!=='same-origin'){
    return {response:privateJson({error:'Use the app to make changes.'},403)} as const;
  }
  const client=bearer?createClient(connection.url,connection.key,{
    global:{headers:{Authorization:'Bearer '+bearer}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  }):await db();
  const {data,error}=await client.auth.getUser(bearer);
  if(error||!data.user) return {response:privateJson({error:'Sign in required.'},401)} as const;
  const verified=data.user.factors?.some(factor=>factor.status==='verified');
  const aal=await client.auth.mfa.getAuthenticatorAssuranceLevel(bearer);
  if(aal.error||((verified||aal.data.nextLevel==='aal2')&&aal.data.currentLevel!=='aal2')){
    return {response:privateJson({error:'Authenticator verification required.'},403)} as const;
  }
  return {session:{client,user:data.user}} as const;
}

export async function readJson(request:Request,maxBytes=4096){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!request.body) return null;
  const reader=request.body.getReader();
  const decoder=new TextDecoder();
  let size=0;
  let text='';
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done) return JSON.parse(text+decoder.decode()) as unknown;
      size+=value.byteLength;
      if(size>maxBytes){void reader.cancel();return null;}
      text+=decoder.decode(value,{stream:true});
    }
  }catch{return null;}finally{reader.releaseLock();}
}
