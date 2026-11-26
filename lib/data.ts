import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Goal,Measurement,Template,Workout} from './model';

function readError(table:string,code:string,message:string):never {
  const safeCode=/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code) ? code : 'unknown';
  console.error(`Workspace database read failed for ${table} (${safeCode})`);
  throw new Error(message);
}

export async function read<T>(client:SupabaseClient, table:string, fields:string, order:string, tie?:string) {
  const result:T[]=[];
  for(let start=0;start<20000;start+=200){
    let query=client.from(table).select(fields).order(order,{ascending:false});
    if(tie) query=query.order(tie);
    const {data,error}=await query.range(start,start+199);
    if(error) readError(table,error.code,'Unable to load private workspace data.');
    if(!data) break;
    result.push(...data as T[]);
    if(data.length<200) return result;
  }
  throw new Error('The workspace history exceeds the current report limit.');
}
export async function dataFor(client:SupabaseClient){
  const [workouts,templates,measurements,goals,prefs,sync]=await Promise.all([
    read<Workout>(client,'workouts','id,title,source,started_at,ended_at,notes,workout_exercises(position,template_id,title,notes,workout_sets(position,type,weight_kg,reps,duration_seconds,distance_meters,rpe))','started_at','id'),
    read<Template>(client,'exercise_templates','id,title,type,equipment,primary_muscle,secondary_muscles','id'),
    read<Measurement>(client,'body_measurements','id,day,kind,value,source','day','id'),
    read<Goal>(client,'goals','id,title,kind,target,deadline,status,created_at','created_at','id'),
    client.from('preferences').select('theme').maybeSingle(),
    client.from('sync_state').select('cursor_at,last_error').maybeSingle(),
  ]);
  if(prefs.error) readError('preferences',prefs.error.code,'Unable to load workspace settings.');
  if(sync.error) readError('sync_state',sync.error.code,'Unable to load workspace settings.');
  return {workouts,templates,measurements,goals,prefs:prefs.data,sync:sync.data};
}
