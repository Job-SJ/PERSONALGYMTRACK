import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
const owner='10000000-0000-0000-0000-000000000001';
it('applies migrations, isolates two owners, and requires AAL2 after TOTP verification',async()=>{
  const sql=new PGlite();
  try {
    await sql.exec(`
      create role anon; create role authenticated;
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
    await sql.exec(`insert into auth.users values ('${owner}');
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
    const other='20000000-0000-0000-0000-000000000002';
    expect((await sql.query('select public.acquire_sync($1) as granted',[owner])).rows).toEqual([{granted:true}]);
    expect((await sql.query('select public.acquire_sync($1) as granted',[other])).rows).toEqual([{granted:false}]);
    expect((await sql.query("select public.finish_sync($1,now(),null) as finished",[other])).rows).toEqual([{finished:false}]);
    expect((await sql.query("select public.finish_sync($1,now(),null) as finished",[owner])).rows).toEqual([{finished:true}]);
    expect((await sql.query('select public.acquire_sync($1) as granted',[other])).rows).toEqual([{granted:false}]);
  } finally {
    await sql.close();
  }
},20000);
