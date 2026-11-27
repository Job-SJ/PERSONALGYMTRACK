import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {config,session} from './supabase';
import {credentialKeyring,openCredential,sealCredential} from './credential-envelope';

type Session=Awaited<ReturnType<typeof session>>;
type Provider='hevy'|'openrouter';

export function credentialsConfigured() {
  return Boolean(config() && process.env.SUPABASE_SERVER_SECRET && process.env.INTEGRATION_KEYS && process.env.INTEGRATION_ACTIVE_KEY);
}

export function integrationCredentials({user}:Session,provider:Provider) {
  const scope={owner:user.id,provider};
  const legacy=provider==='hevy' && user.id===process.env.HEVY_OWNER_ID ? process.env.HEVY_API_KEY : undefined;
  const connection=config();
  const secret=process.env.SUPABASE_SERVER_SECRET;
  const client=connection && secret && credentialsConfigured() ? createClient(connection.url,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  }) : null;
  const keys=()=>credentialKeyring(process.env.INTEGRATION_KEYS!,process.env.INTEGRATION_ACTIVE_KEY!);
  const rows=()=>client!.from('integration_credentials');
  async function find(){
    if(!client) return null;
    const result=await rows().select('envelope').eq('user_id',user.id).eq('provider',provider).maybeSingle();
    if(result.error) throw new Error('Credential storage is unavailable.');
    return result.data;
  }
  async function write(envelope:ReturnType<typeof sealCredential>|null){
    if(!client) throw new Error('Credential storage is unavailable.');
    const result=await rows().upsert({user_id:user.id,provider,envelope});
    if(result.error) throw new Error('Credential storage is unavailable.');
  }
  return {
    async connected(){
      const row=await find();
      return row ? row.envelope!==null : Boolean(legacy);
    },
    async read(){
      const row=await find();
      if(!row) return legacy;
      return row.envelope===null ? undefined : openCredential(row.envelope,scope,keys());
    },
    async reserveHevyCheck(){
      if(!client) return false;
      const result=await client.rpc('reserve_integration_attempt',{owner_id:user.id,operation_name:'hevy_connection'});
      if(result.error) throw new Error('Connection checks are unavailable.');
      return result.data===true;
    },
    save(credential:string){return write(sealCredential(credential,scope,keys()));},
    disconnect(){return write(null);},
  };
}
