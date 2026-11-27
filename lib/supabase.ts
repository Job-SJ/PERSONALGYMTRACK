import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {authCookieOptions,configuredSupabase} from './connection-env';

export const config=()=>configuredSupabase();
export const configured=()=>Boolean(config());
export const publicRegistration=()=>configured()&&process.env.PGT_PUBLIC_REGISTRATION==='true';
export async function db() {
  const connection=config();
  if (!connection) throw new Error('The Supabase connection configuration is invalid.');
  const jar=await cookies();
  return createServerClient(connection.url,connection.key,{
    cookieOptions:authCookieOptions(),
    cookies:{getAll:()=>jar.getAll(),setAll:values=>{try {for(const {name,value,options} of values) jar.set(name,value,options);} catch { /* Proxy handles refresh for Server Components. */ }}},
  });
}
export async function session() {
  if (!configured()) redirect('/');
  const client=await db();
  const {data,error}=await client.auth.getUser();
  if (error || !data.user) redirect('/login');
  const {data:aal,error:aalError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || (aal.nextLevel==='aal2' && aal.currentLevel!=='aal2')) redirect('/mfa');
  return {client,user:data.user};
}
