import {randomBytes} from 'node:crypto';
import {open} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';

if(process.argv.length!==2||!process.stdin.isTTY||!process.stdout.isTTY){
  console.error('Run npm run setup from an interactive local terminal.');
  process.exit(1);
}

let masked=false;
const terminal=new Writable({write(chunk,_encoding,done){
  if(!masked) process.stdout.write(chunk);
  done();
}});
Object.assign(terminal,{isTTY:true,columns:process.stdout.columns});
const prompt=createInterface({input:process.stdin,output:terminal,terminal:true});
prompt.on('SIGINT',()=>{prompt.close();process.exit(130);});

async function ask(label,secret=false){
  if(!secret) return (await prompt.question(label+' ')).trim();
  process.stdout.write(label+' ');
  masked=true;
  try{return (await prompt.question('')).trim();}
  finally{
    masked=false;
    process.stdout.write('\n');
  }
}

function role(key){
  try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;}
  catch{return null;}
}

async function probe(url,pathname,key,token){
  try{
    const response=await fetch(new URL(pathname,url),{
      headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{})},
      redirect:'error',signal:AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    return response.status;
  }catch{return 0;}
}

async function schemaReady(url,key){
  try{
    const response=await fetch(new URL('/rest/v1/rpc/pgt_schema_ready',url),{
      headers:{apikey:key,...(role(key)==='service_role'?{Authorization:'Bearer '+key}:{})},
      redirect:'error',signal:AbortSignal.timeout(10000),
    });
    return response.ok&&await response.json()===true;
  }catch{return false;}
}

async function authSettings(url,key){
  try{
    const response=await fetch(new URL('/auth/v1/settings',url),{
      headers:{apikey:key},redirect:'error',signal:AbortSignal.timeout(10000),
    });
    if(response.ok) return await response.json();
    await response.body?.cancel();
  }catch{}
  return null;
}

async function initialize(){
  const existing=await open('.env','r').catch(error=>{
    if(error.code==='ENOENT') return null;
    throw error;
  });
  if(existing){await existing.close();throw new Error('A .env file already exists. Manage updates through your local secret store.');}
  console.log('PERSONALGYMTRACK setup\nCreate a managed Supabase project and apply the migrations from the repository.');
  console.log('Use an isolated project for verification. The setup tool only reads metadata.');
  const entered=await ask('Supabase project URL');
  let url;
  try{url=new URL(entered);}catch{throw new Error('Enter the full HTTPS project URL.');}
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password){
    throw new Error('Use the HTTPS project origin.');
  }
  const publicKey=await ask('Supabase publishable key');
  const secret=await ask('Supabase server secret (hidden)',true);
  const format=/^[A-Za-z0-9_.-]{20,1200}$/;
  if(!format.test(publicKey)||(!publicKey.startsWith('sb_publishable_')&&role(publicKey)!=='anon')){
    throw new Error('Use the project publishable or legacy anon key.');
  }
  if(!format.test(secret)||(!secret.startsWith('sb_secret_')&&role(secret)!=='service_role')){
    throw new Error('Use the project secret or legacy service role key.');
  }
  const auth=await authSettings(url,publicKey);
  if(!auth||typeof auth.disable_signup!=='boolean') throw new Error('Supabase Auth is unreachable or rejected the publishable key.');
  const tables=['workouts','nutrition_days','integration_credentials','coach_settings','notification_preferences'];
  const checks=await Promise.all(tables.map(async name=>[name,await probe(url,'/rest/v1/'+name+'?select=user_id&limit=0',secret,
    role(secret)==='service_role'?secret:null)]));
  if(checks.some(([,status])=>status===401||status===403)) throw new Error('Supabase rejected the server secret or database grants.');
  const missing=checks.filter(([,status])=>status!==200).map(([table])=>table);
  if(missing.length) throw new Error('Missing or unavailable schema: '+missing.join(', ')+'. Run supabase migration list --remote and apply pending migrations, then retry.');
  if(!await schemaReady(url,secret)) throw new Error('Required schema checks failed. Verify applied migrations with supabase migration list --remote.');
  const registration=(await ask('Enable public registration? [y/N]')).toLowerCase()==='y';
  if(!registration&&!auth.disable_signup) throw new Error('Disable new sign-ups in Supabase Auth for an invitation-only workspace, then retry.');
  if(registration&&(auth.disable_signup||auth.autoconfirm!==false)){
    throw new Error('Enable sign-ups and require email confirmation in Supabase Auth before choosing public registration.');
  }
  const scheduler=(await ask('Enable the Docker notification scheduler? [y/N]')).toLowerCase()==='y';
  const lines=[
    'NEXT_PUBLIC_SUPABASE_URL='+url.origin,
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='+publicKey,
    'SUPABASE_SERVER_SECRET='+secret,
    'INTEGRATION_ACTIVE_KEY=v1',
    'INTEGRATION_KEYS='+JSON.stringify({v1:randomBytes(32).toString('base64url')}),
    'PGT_PUBLIC_REGISTRATION='+registration,
    'PGT_NOTIFICATION_JOB_SECRET='+randomBytes(32).toString('base64url'),
    ...(scheduler?['COMPOSE_PROFILES=notifications']:[]),
  ];
  const output=await open('.env','wx',0o600);
  try{await output.writeFile(lines.join('\n')+'\n');}
  finally{await output.close();}
  console.log('Local .env written. Limit access to this file and store a separate secure copy of the keyring.');
  console.log('Configure the Supabase Auth site URL and email templates, invite the first user, then run docker compose up -d.');
  console.log('After signing in, open Settings → Integrations for Hevy or Coach for OpenRouter.');
}

try{await initialize();}
catch(error){console.error(error instanceof Error&&error.message&&!('code' in error)?error.message:'Initialization could not write the local configuration.');process.exitCode=1;}
finally{prompt.close();}
