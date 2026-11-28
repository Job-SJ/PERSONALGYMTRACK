import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
import {partnerReply,planCoachAnalysis} from '../lib/coach-analysis';
import type {PartnerWorkout} from '../lib/coach-partners';
const owner='10000000-0000-0000-0000-000000000001';
it('applies migrations, isolates two owners, and requires AAL2 after TOTP verification',async()=>{
  const sql=new PGlite();
  try {
    await sql.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      create table auth.mfa_factors(user_id uuid, status text, factor_type text);
      create function auth.jwt() returns jsonb language sql stable as
        'select nullif(current_setting(''request.jwt.claims'',true), '''')::jsonb';
      create function auth.uid() returns uuid language sql stable as
        'select (auth.jwt()->>''sub'')::uuid';
    `);
    for(const path of ['migrations/202611250001_core.sql','migrations/202611250002_mfa.sql','migrations/202611250003_sync_lifecycle.sql','migrations/202611260001_nutrition.sql','tests/isolation.sql','tests/nutrition_isolation.sql']){
      await sql.exec(await readFile(new URL('../supabase/'+path,import.meta.url),'utf8'));
    }
    await sql.exec(await readFile(new URL('../supabase/migrations/202611270001_integration_credentials.sql',import.meta.url),'utf8'));
    await sql.exec(await readFile(new URL('../supabase/migrations/202611270002_coach.sql',import.meta.url),'utf8'));
    await sql.exec(await readFile(new URL('../supabase/migrations/202611270003_notifications.sql',import.meta.url),'utf8'));
    await sql.exec(await readFile(new URL('../supabase/migrations/202611280001_coach_chat.sql',import.meta.url),'utf8'));
    await sql.exec(await readFile(new URL('../supabase/migrations/202611280002_coach_evidence.sql',import.meta.url),'utf8'));
    await sql.exec(await readFile(new URL('../supabase/migrations/202611280003_hevy_workout_metadata.sql',import.meta.url),'utf8'));
    const [tableCheck,policies,constraints,indexes,rpcCheck]=await sql.exec(await readFile(new URL('../supabase/tests/schema_check.sql',import.meta.url),'utf8'));
    expect(tableCheck.rows).toHaveLength(8);
    for(const table of tableCheck.rows) expect(table).toMatchObject({
      rls_enabled:true,owner_policies:1,restrictive_policies:1,anon_select:false,
      authenticated_select:true,authenticated_insert:true,authenticated_update:true,authenticated_delete:true,
    });
    expect(policies.rows).toHaveLength(16);
    expect(constraints.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({table_name:'workout_sets',validated:true,definition:expect.stringContaining('PRIMARY KEY (user_id, workout_id, exercise_position, "position")')}),
      expect.objectContaining({table_name:'workout_sets',validated:true,definition:expect.stringContaining('ON DELETE CASCADE')}),
    ]));
    expect(indexes.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({table_name:'workouts',index_name:'workouts_started',valid:true,ready:true}),
    ]));
    expect(rpcCheck.rows).toHaveLength(3);
    for(const rpc of rpcCheck.rows) expect(rpc).toMatchObject({
      security_definer:false,anon_execute:false,authenticated_execute:true,
    });
    const other='20000000-0000-0000-0000-000000000002';
    await sql.exec(`insert into auth.users values ('${owner}'),('${other}');
      insert into auth.mfa_factors values ('${owner}','verified','totp');
      insert into public.body_measurements(user_id,day,kind,value) values ('${owner}','2025-01-01','weight',80);
      set role authenticated;`);
    const setAal=async(aal:string)=>{
      await sql.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,aal})]);
    };
    await setAal('aal1');
    expect((await sql.query('select value from public.body_measurements')).rows).toEqual([]);
    await setAal('aal2');
    expect((await sql.query('select value::int from public.body_measurements')).rows).toEqual([{value:80}]);
    await sql.exec('reset role');
    await sql.query(`insert into public.workouts(user_id,id,title,source,started_at,ended_at,notes) values
      ($1,'synthetic-partner-a','Push with Alex','csv','2026-11-06T12:00Z','2026-11-06T13:00Z','Trained with Alex.'),
      ($1,'synthetic-partner-b','Legs','csv','2026-11-08T12:00Z','2026-11-08T13:00Z','Trained with Alex.'),
      ($1,'synthetic-partner-c','Upper','csv','2026-11-09T12:00Z','2026-11-09T13:00Z',null),
      ($2,'synthetic-partner-a','Training with Jamie','csv','2026-11-10T12:00Z','2026-11-10T13:00Z',null)`,[owner,other]);
    await sql.exec('set role authenticated');
    const metadata=[{id:'synthetic-metadata',source:'hevy',title:'Steps',started_at:'2026-11-07T12:00Z',ended_at:'2026-11-07T13:00Z',
      routine_id:'synthetic-routine',workout_exercises:[{position:0,template_id:'steps',title:'Steps',superset_id:0,
        workout_sets:[{position:0,type:'normal',custom_metric:45}]}]}];
    for(let attempt=0;attempt<2;attempt++) await sql.query('select public.store_workouts($1)',[JSON.stringify(metadata)]);
    expect((await sql.query(`select routine_id,superset_id,custom_metric::int from public.workouts
      join public.workout_exercises e on e.user_id=workouts.user_id and e.workout_id=workouts.id
      join public.workout_sets s on s.user_id=e.user_id and s.workout_id=e.workout_id and s.exercise_position=e.position
      where workouts.id='synthetic-metadata'`)).rows).toEqual([{routine_id:'synthetic-routine',superset_id:0,custom_metric:45}]);
    const stored=await sql.query<PartnerWorkout>(`select id,title,notes,started_at::text,ended_at::text,'[]'::json as workout_exercises
      from public.workouts where id like 'synthetic-partner-%'`);
    const question='Who do I usually train with?';
    const [partnerQuery]=planCoachAnalysis(question,'','2026-11-28');
    const evidence=partnerReply(stored.rows,partnerQuery,question,'',false);
    expect(evidence.text).toContain('**Alex** — 2 workouts');
    expect(evidence.text).not.toContain('Jamie');
    expect(evidence.evidence.dates).toEqual(['2026-11-08','2026-11-06']);
    expect((await sql.query('select public.acquire_sync($1) as granted',[owner])).rows).toEqual([{granted:true}]);
    expect((await sql.query('select public.acquire_sync($1) as granted',[other])).rows).toEqual([{granted:false}]);
    expect((await sql.query("select public.finish_sync($1,now(),null) as finished",[other])).rows).toEqual([{finished:false}]);
    expect((await sql.query("select public.finish_sync($1,now(),null) as finished",[owner])).rows).toEqual([{finished:true}]);
    expect((await sql.query('select public.acquire_sync($1) as granted',[other])).rows).toEqual([{granted:false}]);
    await expect(sql.query('select envelope from public.integration_credentials')).rejects.toThrow(/permission denied/);
    await expect(sql.query("select public.reserve_integration_attempt($1,'hevy_connection')",[owner])).rejects.toThrow(/permission denied/);
    await expect(sql.query('select * from public.coach_usage')).rejects.toThrow(/permission denied/);
    await expect(sql.query('select * from public.coach_settings')).rejects.toThrow(/permission denied/);
    await expect(sql.query('select * from public.push_registrations')).rejects.toThrow(/permission denied/);
    await expect(sql.query('select * from public.claim_notification_accounts(10)')).rejects.toThrow(/permission denied/);
    await expect(sql.query('select public.pgt_schema_ready()')).rejects.toThrow(/permission denied/);
    await sql.exec('set role service_role');
    expect((await sql.query('select public.pgt_schema_ready() as ready')).rows).toEqual([{ready:true}]);
    const reserve=()=>sql.query("select public.reserve_integration_attempt($1,'hevy_connection') as allowed",[owner]);
    expect((await reserve()).rows).toEqual([{allowed:true}]);
    expect((await reserve()).rows).toEqual([{allowed:false}]);
    await sql.query('insert into public.integration_credentials values ($1,$2,$3)',[owner,'hevy',JSON.stringify({version:'synthetic'})]);
    await sql.query('update public.integration_credentials set envelope=null where user_id=$1 and provider=$2',[owner,'hevy']);
    expect((await sql.query('select envelope from public.integration_credentials where user_id=$1',[owner])).rows).toEqual([{envelope:null}]);
    await sql.query("insert into public.coach_settings(user_id,enabled,consent_at,model,endpoint,credential_source,prompt_price,completion_price,monthly_micros,revision) values ($1,true,now(),'synthetic/model','synthetic','personal',0,0,100,$2)",[owner,other]);
    const spend=(requester:string,revision:string,cost:number)=>sql.query('select public.reserve_coach_request($1,$2,$3) as id',[requester,revision,cost]);
    expect((await spend(other,other,1)).rows).toEqual([{id:null}]);
    expect((await spend(owner,owner,1)).rows).toEqual([{id:null}]);
    expect((await spend(owner,other,101)).rows).toEqual([{id:null}]);
    expect((await spend(owner,other,90)).rows[0]).toEqual({id:expect.any(String)});
    expect((await spend(owner,other,0)).rows).toEqual([{id:null}]);
    await sql.query("update public.coach_usage set created_at=now()-interval '30 seconds' where user_id=$1",[owner]);
    expect((await spend(owner,other,11)).rows).toEqual([{id:null}]);
    expect((await spend(owner,other,10)).rows[0]).toEqual({id:expect.any(String)});
    const putConversation=(user:string)=>sql.query('insert into public.coach_conversations(id,user_id) values ($1,$1)',[user]);
    await putConversation(owner);
    await putConversation(other);
    const putTurn=(conversation:string,user:string,text:string)=>sql.query(
      'insert into public.coach_turns(id,conversation_id,user_id,prompt) values (gen_random_uuid(),$1,$2,$3)',[conversation,user,text]);
    await putTurn(owner,owner,'Synthetic owner message');
    await putTurn(owner,owner,'Synthetic follow-up');
    await putTurn(other,other,'Synthetic other message');
    await expect(putTurn(other,owner,'Cross-account message')).rejects.toThrow(/foreign key/);
    await expect(putTurn(owner,owner,'é'.repeat(901))).rejects.toThrow(/check constraint/);
    await sql.exec('set role authenticated');
    await setAal('aal1');
    expect((await sql.query('select id from public.coach_conversations')).rows).toEqual([]);
    expect((await sql.query('select prompt from public.coach_turns')).rows).toEqual([]);
    await setAal('aal2');
    expect((await sql.query('select id from public.coach_conversations')).rows).toEqual([{id:owner}]);
    expect((await sql.query('select prompt from public.coach_turns order by prompt')).rows)
      .toEqual([{prompt:'Synthetic follow-up'},{prompt:'Synthetic owner message'}]);
    await expect(sql.query("update public.coach_conversations set title='Changed'")).rejects.toThrow(/permission denied/);
    await expect(sql.query('select attempt from public.coach_turns')).rejects.toThrow(/permission denied/);
    await sql.exec('set role anon');
    await expect(sql.query('select id from public.coach_conversations')).rejects.toThrow(/permission denied/);
    await sql.exec('set role service_role');
    await sql.query("update public.coach_turns set attempt=gen_random_uuid(),started_at=now() where prompt='Synthetic owner message'");
    await expect(sql.query("update public.coach_turns set attempt=gen_random_uuid(),started_at=now() where prompt='Synthetic follow-up'"))
      .rejects.toThrow(/coach_turns_one_generation/);
    await sql.query('delete from public.coach_conversations where id=$1 and user_id=$1',[owner]);
    expect((await sql.query('select prompt from public.coach_turns')).rows).toEqual([{prompt:'Synthetic other message'}]);
    expect((await sql.query('select count(*)::int as count from public.coach_usage where user_id=$1',[owner])).rows).toEqual([{count:2}]);
    await sql.query("insert into public.notification_preferences(user_id,timezone,reminder_time,quiet_start,quiet_end,categories) values ($1,'Europe/Amsterdam','19:00','22:00','08:00',array['weekly'])",[owner]);
    expect((await sql.query('select user_id from public.claim_notification_accounts(10)')).rows).toEqual([{user_id:owner}]);
    expect((await sql.query('select user_id from public.claim_notification_accounts(10)')).rows).toEqual([]);
    for(let attempt=0;attempt<2;attempt++) await sql.query("insert into public.notifications(user_id,category,period) values ($1,'weekly','synthetic-week') on conflict do nothing",[owner]);
    expect((await sql.query('select count(*)::int as count from public.notifications where user_id=$1',[owner])).rows).toEqual([{count:1}]);
    const reservePush=()=>sql.query("select public.reserve_notification_push($1,'2025-04-05') as allowed",[owner]);
    expect((await reservePush()).rows).toEqual([{allowed:true}]);
    expect((await reservePush()).rows).toEqual([{allowed:false}]);
  } finally {
    await sql.close();
  }
},20000);
