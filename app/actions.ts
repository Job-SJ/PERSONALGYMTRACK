'use server';
import {cookies} from 'next/headers';
import {localeCookie,resolveLocale} from '../lib/format';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {configured,config,db,publicRegistration,session} from '../lib/supabase';
import {hevy,HevyError} from '../lib/hevy';
import {runSync} from '../lib/sync';
import {parseCsv} from '../lib/csv';
import {integrationCredentials} from '../lib/integration-credentials';

const back=(section:string,status:string)=>redirect('/app/'+section+'?status='+encodeURIComponent(status));
export async function login(form:FormData) {
  if (!configured()) redirect('/?status=setup');
  const input=z.object({email:z.email().max(254),password:z.string().min(1).max(1024)}).safeParse(Object.fromEntries(form));
  if (!input.success) redirect('/login?status=failed');
  const client=await db();
  const result=await client.auth.signInWithPassword(input.data);
  if (result.error) redirect('/login?status=failed');
  redirect('/app');
}
export async function logout() {
  const connection=config();
  if(connection){
    try{await (await db()).auth.signOut({scope:'local'});}
    catch{/* Clear the browser session even when Auth is unreachable. */}
    finally{
      const jar=await cookies();
      const key='sb-'+new URL(connection.url).hostname.split('.')[0]+'-auth-token';
      for(const {name} of jar.getAll()) if(name===key||name.startsWith(key+'.')) jar.delete(name);
    }
  }
  redirect('/');
}
export async function register(form:FormData){
  if(!publicRegistration()) redirect('/login');
  const input=z.object({email:z.email().max(254),password:z.string().min(12).max(72)}).safeParse(Object.fromEntries(form));
  if(!input.success) redirect('/register?status=invalid');
  const client=await db();
  await client.auth.signUp(input.data);
  redirect('/register?status=check-email');
}
export async function sendReset(form:FormData) {
  const email=z.email().max(254).safeParse(form.get('email'));
  if (configured() && email.success) await (await db()).auth.resetPasswordForEmail(email.data);
  redirect('/reset?sent=1');
}
type Enrollment={id?:string;secret?:string;error?:string};
export async function enrollMfa():Promise<Enrollment> {
  const {client}=await session();
  const {data:factors,error}=await client.auth.mfa.listFactors();
  if (error || factors.totp.length) return {error:'Authenticator setup is unavailable.'};
  for(const factor of factors.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){
    const removed=await client.auth.mfa.unenroll({factorId:factor.id});
    if(removed.error) return {error:'An incomplete setup could not be cleared.'};
  }
  const result=await client.auth.mfa.enroll({factorType:'totp',issuer:'PERSONALGYMTRACK'});
  if(result.error) return {error:'Authenticator setup could not be started.'};
  return {id:result.data.id,secret:result.data.totp.secret};
}
export async function confirmMfa(form:FormData) {
  const {client}=await session();
  const input=z.object({factor:z.uuid(),code:z.string().regex(/^\d{6}$/)}).safeParse(Object.fromEntries(form));
  if(!input.success) return back('settings','Enter a valid authenticator code.');
  const result=await client.auth.mfa.challengeAndVerify({factorId:input.data.factor,code:input.data.code});
  back('settings',result.error?'Authenticator setup could not be verified. Start setup again.':'Authenticator verification enabled.');
}
export async function verifyMfa(form:FormData) {
  const code=z.string().regex(/^\d{6}$/).safeParse(form.get('code'));
  if (!configured() || !code.success) redirect('/mfa?status=failed');
  const client=await db();
  const factors=await client.auth.mfa.listFactors();
  const factor=factors.data?.totp[0];
  if (!factor) redirect('/login');
  const result=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:code.data});
  if (result.error) redirect('/mfa?status=failed');
  redirect('/app');
}
export async function setPassword(form:FormData) {
  const {client}=await session();
  const password=z.string().min(12).max(72).safeParse(form.get('password'));
  if (!password.success) back('settings','Use a password of 12 to 72 characters.');
  const result=await client.auth.updateUser({password:password.data});
  back('settings',result.error?'Password could not be updated.':'Password updated.');
}
export async function sync(form:FormData) {
  const authenticated=await session();
  const credentials=integrationCredentials(authenticated,'hevy');
  let status='Synchronization complete.';
  try {
    const key=await credentials.read();
    if(!key) throw new HevyError('Connect Hevy before synchronizing.');
    if (form.get('mode')==='test') {
      if(process.env.SUPABASE_SERVER_SECRET && !await credentials.reserveCheck()) throw new HevyError('Wait 15 seconds before testing again.');
      await hevy(key).test(AbortSignal.timeout(12000));
      status='Hevy connection verified.';
    } else {
      await runSync(authenticated.client,authenticated.user.id,key);
      revalidatePath('/app');
    }
  } catch(err) {
    status=err instanceof HevyError?err.message:'Synchronization failed.';
  }
  revalidatePath('/app','layout');
  back('integrations',status);
}
export async function configureHevy(form:FormData) {
  const credentials=integrationCredentials(await session(),'hevy');
  const mode=z.enum(['connect','disconnect','migrate']).safeParse(form.get('mode'));
  if(!mode.success) return back('integrations','Choose a valid connection action.');
  let status:string;
  try {
    if(mode.data==='disconnect'){
      await credentials.disconnect();
      status='Hevy disconnected. Imported workouts are still available.';
    }else{
      const key=z.string().trim().regex(/^[\x21-\x7e]{8,512}$/).safeParse(mode.data==='migrate' ? await credentials.read() : form.get('key'));
      if(!key.success) throw new HevyError('Enter a valid Hevy API key.');
      if(!await credentials.reserveCheck()) throw new HevyError('Wait 15 seconds before testing again.');
      await hevy(key.data).test(AbortSignal.timeout(12000));
      await credentials.save(key.data);
      status='Hevy connection verified and saved.';
    }
  }catch(error){
    status=error instanceof HevyError ? error.message : 'Hevy settings could not be saved. Check instance configuration and try again.';
  }
  revalidatePath('/app/integrations');
  back('integrations',status);
}
export async function importCsv(form:FormData) {
  const {client}=await session();
  const file=form.get('csv');
  if (!(file instanceof File) || file.size===0 || file.size>1500000) back('integrations','Choose a Hevy CSV under 1.5 MB.');
  let status:string;
  try {
    const items=parseCsv(await (file as File).text());
    const result=await client.rpc('store_workouts',{items});
    status=result.error?'Import could not be stored.':`${items.length} workouts processed.`;
  } catch {status='CSV could not be read. Check the format and timestamps.';}
  revalidatePath('/app','layout');
  back('integrations',status);
}
const date=z.iso.date();
export async function measurement(form:FormData) {
  const {client,user}=await session();
  const id=z.uuid().safeParse(form.get('id'));
  if (form.get('mode')==='delete' && id.success) {
    const {error}=await client.from('body_measurements').delete().eq('id',id.data).eq('source','manual');
    back('body',error?'Measurement could not be deleted.':'Measurement deleted.');
  }
  const data=z.object({day:date,kind:z.enum(['weight','body_fat','muscle_mass','waist','arm','chest','thigh','calf']),value:z.coerce.number().positive().max(700)}).safeParse(Object.fromEntries(form));
  if (!data.success) return back('body','Enter a valid measurement.');
  if (data.data.kind==='body_fat' && data.data.value>100) return back('body','Enter a percentage between 0 and 100.');
  const row={...data.data,user_id:user.id,source:'manual'};
  const table=client.from('body_measurements');
  const result=id.success?await table.update(row).eq('id',id.data).eq('source','manual'):await table.insert(row);
  back('body',result.error?'Measurement could not be saved. Check for an existing entry on that date.':'Measurement saved.');
}
export async function goal(form:FormData) {
  const {client,user}=await session();
  const id=z.uuid().safeParse(form.get('id'));
  const status=z.enum(['active','paused','archived']).safeParse(form.get('status'));
  if (id.success && status.success) {
    const result=await client.from('goals').update({status:status.data}).eq('id',id.data);
    return back('goals',result.error?'Goal could not be updated.':'Goal updated.');
  }
  const data=z.object({title:z.string().trim().min(1).max(100),kind:z.enum(['workouts','weekly_workouts','weight']),target:z.coerce.number().positive().max(100000),deadline:date.or(z.literal(''))}).safeParse(Object.fromEntries(form));
  if (!data.success) return back('goals','Enter a valid target and title.');
  const result=await client.from('goals').insert({...data.data,user_id:user.id,deadline:data.data.deadline||null});
  back('goals',result.error?'Goal could not be saved.':'Goal saved.');
}
export async function preferences(form:FormData) {
  const {client,user}=await session();
  const theme=z.enum(['dark','light','oled']).safeParse(form.get('theme'));
  if (!theme.success) return back('settings','Select a theme.');
  const result=await client.from('preferences').upsert({user_id:user.id,theme:theme.data});
  if (!result.error) (await cookies()).set(localeCookie,resolveLocale(String(form.get('locale'))),{path:'/',httpOnly:true,sameSite:'lax',maxAge:31536000});
  back('settings',result.error?'Preferences could not be saved.':'Preferences saved.');
}
