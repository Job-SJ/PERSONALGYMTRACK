import {describe,expect,it,vi} from 'vitest';
import {hevy} from '../lib/hevy';
import {importHevy} from '../lib/sync-engine';
import {publicSupabase} from '../lib/connection-env';
import type {Workout} from '../lib/model';

const now=new Date('2026-11-25T15:00:00Z');
const stub=(id:string,title:string)=>({id,title,start_time:'2026-11-25T11:00:00Z',end_time:'2026-11-25T12:00:00Z',exercises:[]});
const updated=(id:string,title:string)=>({type:'updated',workout:stub(id,title)});
const deleted=(id:string)=>({type:'deleted',id,deleted_at:'2026-11-25T14:59:00Z'});
const envelope=(field:string,rows:unknown[])=>({page:1,page_count:1,[field]:rows});
function harness(handlers:Record<string,unknown>) {
  const transport=vi.fn<typeof fetch>().mockImplementation(async url=>{
    const path=new URL(String(url)).pathname;
    if(!(path in handlers)) throw new Error('Unexpected endpoint');
    return Response.json(handlers[path]);
  });
  const records=new Map<string,Workout>();
  const store={
    templates:vi.fn(async()=>{}),
    workouts:vi.fn(async(items:Workout[],ids:string[])=>{
      for(const id of ids) records.delete(id);
      for(const w of items) records.set(w.id,w);
    }),
    count:async()=>records.size,
  };
  const source=hevy('fixture-only',transport,async()=>{});
  return {source,store,records,transport,signal:new AbortController().signal};
}
describe('Hevy sync engine',()=>{
  it('imports templates and history, then reconciles edits made during the scan',async()=>{
    const h=harness({
      '/v1/exercise_templates':envelope('exercise_templates',[{id:'press',title:'Press',type:'weight_reps',primary_muscle_group:'chest',secondary_muscle_groups:['triceps']}]),
      '/v1/workouts':envelope('workouts',[stub('retained','Before edit'),stub('deleted','Deleted'),stub('retained','Duplicate')]),
      '/v1/workouts/events':envelope('events',[updated('retained','Latest'),deleted('deleted'),updated('deleted','Older')]),
      '/v1/workouts/count':{workout_count:1},
    });
    expect(await importHevy(h.source,h.store,null,now,h.signal)).toBe(now.toISOString());
    expect([...h.records.values()].map(w=>w.title)).toEqual(['Latest']);
    expect(h.store.templates).toHaveBeenCalledWith([expect.objectContaining({primary_muscle:'chest',secondary_muscles:['triceps']})]);
    expect(h.transport.mock.calls.every(([,opts])=>opts?.method===undefined)).toBe(true);
  });
  it('replays an overlapping incremental window idempotently without scanning history',async()=>{
    const h=harness({
      '/v1/exercise_templates':envelope('exercise_templates',[]),
      '/v1/workouts/events':envelope('events',[updated('new','Created'),deleted('old')]),
      '/v1/workouts/count':{workout_count:1},
    });
    for(let run=0;run<2;run++) await importHevy(h.source,h.store,'2026-11-25T14:00:00Z',now,h.signal);
    expect([...h.records.keys()]).toEqual(['new']);
    expect(h.transport.mock.calls.map(([url])=>new URL(String(url))).filter(u=>u.pathname.endsWith('/events')).map(u=>u.searchParams.get('since'))).toEqual(Array(2).fill('2026-11-25T13:55:00.000Z'));
  });
  it('refreshes old metadata by existing workout ID without treating absent workouts as deletions',async()=>{
    const recorded={...stub('same','Workout'),routine_id:'synthetic-routine',exercises:[{
      index:0,title:'Steps',exercise_template_id:'stairs',superset_id:0,sets:[{index:0,type:'normal',custom_metric:45}],
    }]};
    const h=harness({
      '/v1/exercise_templates':envelope('exercise_templates',[]),
      '/v1/workouts':envelope('workouts',[recorded]),
      '/v1/workouts/events':envelope('events',[]),
      '/v1/workouts/count':{workout_count:1},
    });
    for(let run=0;run<2;run++) await importHevy(h.source,h.store,'2026-11-25T14:00:00Z',now,h.signal,true);
    expect([...h.records.keys()]).toEqual(['same']);
    expect(h.records.get('same')).toMatchObject({routine_id:'synthetic-routine',workout_exercises:[{
      superset_id:0,workout_sets:[{custom_metric:45}],
    }]});
    expect(h.store.workouts.mock.calls.every(([,deletedIds])=>!deletedIds.length)).toBe(true);
  });
  it('refuses to advance the cursor when the provider workout count disagrees',async()=>{
    const h=harness({
      '/v1/exercise_templates':envelope('exercise_templates',[]),
      '/v1/workouts/events':envelope('events',[]),
      '/v1/workouts/count':{workout_count:1},
    });
    await expect(importHevy(h.source,h.store,now.toISOString(),now,h.signal)).rejects.toThrow('counts differ');
  });
});
it('rejects secret keys, service-role JWTs and unencrypted remote URLs',()=>{
  const jwt=(role:string)=>'stub.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.stub';
  const url='https://example.supabase.co';
  expect(publicSupabase(url,'sb_publishable_fixture')).not.toBeNull();
  expect(publicSupabase(url,jwt('anon'))).not.toBeNull();
  expect(publicSupabase(url,jwt('service_role'))).toBeNull();
  expect(publicSupabase(url,'sb_secret_fixture')).toBeNull();
  expect(publicSupabase('http://example.supabase.co','sb_publishable_fixture')).toBeNull();
});
