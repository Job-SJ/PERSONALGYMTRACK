import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';

export const fixturePort=Number(process.env.PGT_FIXTURE_PORT??(Number(process.env.PGT_PRIVATE_E2E_PORT??3141)-1));
export const userOne='10000000-0000-4000-8000-000000000001';
export const userTwo='20000000-0000-4000-8000-000000000002';
const factorId='30000000-0000-4000-8000-000000000003';
const secret='synthetic fixture signing material';
const format=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'});
const today=format.format(new Date());
const on=(offset)=>new Date(Date.parse(today)+offset*86400000).toISOString().slice(0,10);
const created='2025-01-01T00:00:00Z';
const template={id:'fixture-bench',title:'Bench Press (Barbell)',type:'weight_reps',equipment:'barbell',primary_muscle:'chest',secondary_muscles:['triceps']};
const entries=[{id:'40000000-0000-4000-8000-000000000004',day:today,meal:'Lunch',created_at:today+'T12:00:00Z',
  portion:{amount:200,unit:'g',food:{name:'Synthetic oat bowl',source:'Custom label',preparation:'As sold',basis:'g',values:{kcal:180,protein:12,carbs:20,fat:5}}}}];
const factors=[{id:factorId,status:'verified',factor_type:'totp',friendly_name:'Synthetic factor',created_at:created,updated_at:created}];
const coachConversations=new Map();
const coachTurns=new Map();
const confirmedFoods=new Map();
const account=(id)=>({id,aud:'authenticated',role:'authenticated',email:id===userOne?'one@example.invalid':'two@example.invalid',created_at:created,
  app_metadata:{provider:'email'},user_metadata:{},factors:id===userTwo?factors:[]});
const base=(value)=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function accessToken(id,aal='aal1'){
  const header=base({typ:'JWT',alg:'HS256'});
  const claims=base({sub:id,role:'authenticated',aud:'authenticated',aal,exp:Math.floor(Date.now()/1000)+3600,
    iss:'http://127.0.0.1:'+fixturePort+'/auth/v1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]});
  return header+'.'+claims+'.'+createHmac('sha256',secret).update(header+'.'+claims).digest('base64url');
}
function verify(token){
  try{
    const [a,b,c]=token.split('.');
    if(createHmac('sha256',secret).update(a+'.'+b).digest('base64url')!==c) return null;
    return JSON.parse(Buffer.from(b,'base64url').toString('utf8'));
  }catch{return null;}
}
function signIn(id,aal){
  return {access_token:accessToken(id,aal),refresh_token:'synthetic-refresh-'+id,token_type:'bearer',expires_in:3600,user:account(id)};
}
function rows(table,id){
  const isOne=id===userOne;
  if(table==='preferences') return [{theme:isOne?'dark':'light'}];
  if(table==='exercise_templates') return [template];
  if(table==='sync_state') return [];
  if(table==='nutrition_entries') return [...(isOne?entries:[]),...[...confirmedFoods.values()].filter(row=>row.user_id===id)];
  if(table==='nutrition_days') return [];
  if(table==='body_measurements') return [{id:'fixture-weight',day:on(-1),kind:'weight',source:'manual',value:isOne?82:61}];
  if(table==='workouts') return Array.from({length:isOne?12:3},(_,index)=>({
    id:'fixture-workout-'+index,title:(isOne?'Cedar':'Maple')+' session '+(index+1),source:'hevy',
    started_at:on(-1-index*4)+'T17:00:00Z',ended_at:on(-1-index*4)+'T18:00:00Z',
    notes:index<2?(isOne?['Great session (@Synthetic_Partner7) & @synthetic.track2','@SYNTHETIC_PARTNER7 @synthetic_partner7'][index]:'@synthetic_isolated'):null,
    workout_exercises:[{position:0,template_id:template.id,title:template.title,notes:null,workout_sets:[
      {position:0,type:'normal',reps:5,weight_kg:90-index*2,duration_seconds:null,distance_meters:null,rpe:8},
    ]}],
  }));
  return [];
}

if(process.env.PGT_FIXTURE_LISTEN==='1'){
  const server=createServer(async(request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1:'+fixturePort);
    let incoming='';
    for await(const chunk of request) incoming+=chunk;
    let body={};
    try{if(incoming) body=JSON.parse(incoming);}catch{}
    const send=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));};
    const auth=request.headers.authorization?.replace(/^Bearer /,'')??'';
    const claims=verify(auth);
    if(url.pathname==='/health') return send(200,{ok:true});
    if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
      if(body.password!=='synthetic-password') return send(400,{message:'Invalid credentials'});
      return send(200,signIn(body.email==='two@example.invalid'?userTwo:userOne,'aal1'));
    }
    if(url.pathname==='/auth/v1/user') return claims?send(200,account(claims.sub)):send(401,{message:'Invalid session'});
    if(url.pathname.endsWith('/challenge')&&claims?.sub===userTwo) return send(200,{id:'synthetic-challenge',expires_at:Math.floor(Date.now()/1000)+300});
    if(url.pathname.endsWith('/verify')&&claims?.sub===userTwo) return body.code==='123456'?send(200,signIn(userTwo,'aal2')):send(400,{message:'Invalid code'});
    if(url.pathname==='/auth/v1/logout'&&claims) return send(200,{});
    if(url.pathname.startsWith('/rest/v1/')){
      const table=url.pathname.split('/')[3];
      const filters=url.searchParams;
      const owner=filters.get('user_id')?.slice(3)??body.user_id;
      const objectResponse=request.headers.accept?.includes('vnd.pgrst.object');
      const recordId=filters.get('id')?.slice(3);
      if(auth==='sb_secret_synthetic-fixture'){
        if(table==='rpc'&&url.pathname.endsWith('/reserve_coach_request')){
          return send(200,body.cost_micros===0?'50000000-0000-4000-8000-000000000005':null);
        }
        if(table==='coach_settings'&&(owner===userOne||owner===userTwo)) return send(200,[{
          enabled:true,consent_at:created,chat_consent_at:created,credential_source:'personal',model:'synthetic/free',
          endpoint:'synthetic',prompt_price:0,completion_price:0,monthly_micros:0,revision:'60000000-0000-4000-8000-000000000006',
        }]);
        if(table==='coach_conversations'||table==='coach_turns'){
          const records=table==='coach_conversations'?coachConversations:coachTurns;
          if(request.method==='POST'){
            const record={title:'New chat',updated_at:created,created_at:created,answer:null,...body};
            records.set(record.id,record);
            return send(201,objectResponse?record:[record]);
          }
          let selected=[...records.values()].filter(row=>row.user_id===owner&&(!recordId||row.id===recordId));
          const conversation=filters.get('conversation_id')?.slice(3);
          if(conversation) selected=selected.filter(row=>row.conversation_id===conversation);
          const attempt=filters.get('attempt')?.match(/^eq\.(.*)$/)?.[1];
          if(attempt) selected=selected.filter(row=>row.attempt===attempt);
          if(request.method==='PATCH'&&!filters.get('started_at')?.startsWith('lt.')) for(const row of selected) Object.assign(row,body);
          return send(200,objectResponse?selected[0]??null:selected);
        }
        return send(200,[]);
      }
      if(!claims||(claims.sub===userTwo&&claims.aal!=='aal2')) return send(403,{code:'42501',message:'Access denied'});
      if(table==='nutrition_entries'&&request.method==='POST'&&filters.get('on_conflict')==='user_id,id'&&
        request.headers.prefer?.includes('resolution=ignore-duplicates')){
        if(!Array.isArray(body)||body.some(row=>row.user_id!==claims.sub)) return send(403,{code:'42501',message:'Access denied'});
        for(const row of body){
          const key=row.user_id+':'+row.id;
          if(!confirmedFoods.has(key)) confirmedFoods.set(key,{...row,created_at:created});
        }
        return send(201,[]);
      }
      if(table==='coach_conversations'){
        return send(200,[...coachConversations.values()].filter(row=>row.user_id===claims.sub&&(!recordId||row.id===recordId)));
      }
      if(table==='coach_turns'){
        const conversation=filters.get('conversation_id')?.slice(3);
        return send(200,[...coachTurns.values()].filter(row=>row.user_id===claims.sub&&row.conversation_id===conversation));
      }
      if(table==='workouts'&&filters.get('select')==='id,started_at,ended_at,notes'){
        const records=rows(table,claims.sub);
        if(claims.sub===userOne){
          const older=Array.from({length:505},(_,index)=>({...records.at(-1),id:'older-'+index,
            started_at:on(-100-index)+'T17:00:00Z',ended_at:on(-100-index)+'T18:00:00Z',
            notes:index===504?'@synthetic_partner7':null}));
          records.push(...older);
        }
        const offset=Number(filters.get('offset')??0);
        const selected=records.slice(offset,offset+Number(filters.get('limit')??200));
        response.setHeader('Content-Range',`${offset}-${offset+selected.length-1}/${records.length}`);
        return send(200,selected);
      }
      return send(200,rows(table,claims.sub));
    }
    return send(404,{message:'Synthetic endpoint unavailable'});
  });
  server.listen(fixturePort,'127.0.0.1');
}
