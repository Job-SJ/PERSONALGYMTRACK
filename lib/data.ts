import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Goal,Measurement,Template,Workout} from './model';

export class WorkspaceReadError extends Error {
  constructor(readonly code:string,message:string){
    super(message);
  }
}

function readError(table:string,code:string,message:string):never {
  const safeCode=/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code) ? code : 'unknown';
  console.error(`Workspace database read failed for ${table} (${safeCode})`);
  throw new WorkspaceReadError(safeCode,message);
}

export async function read<T>(client:SupabaseClient, table:string, fields:string, order:string, tie?:string, dates?:{start:string;end:string}) {
  const result:T[]=[];
  for(let start=0;start<20000;start+=200){
    let query=client.from(table).select(fields).order(order,{ascending:false});
    if(tie) query=query.order(tie);
    if(dates) query=query.gte('day',dates.start).lte('day',dates.end);
    const {data,error}=await query.range(start,start+199);
    if(error) readError(table,error.code,'Unable to load private workspace data.');
    if(!data) break;
    result.push(...data as T[]);
    if(data.length<200) return result;
  }
  throw new Error('The workspace history exceeds the current report limit.');
}
type DataSelection={workouts?:boolean;templates?:boolean;measurements?:boolean;goals?:boolean;sync?:boolean};

export async function dataFor(client:SupabaseClient,selection?:DataSelection){
  const [workouts,templates,measurements,goals,prefs,sync]=await Promise.all([
    !selection||selection.workouts?read<Workout>(client,'workouts','id,title,source,started_at,ended_at,notes,workout_exercises(position,template_id,title,notes,workout_sets(position,type,weight_kg,reps,duration_seconds,distance_meters,rpe))','started_at','id'):[],
    !selection||selection.templates?read<Template>(client,'exercise_templates','id,title,type,equipment,primary_muscle,secondary_muscles','id'):[],
    !selection||selection.measurements?read<Measurement>(client,'body_measurements','id,day,kind,value,source','day','id'):[],
    !selection||selection.goals?read<Goal>(client,'goals','id,title,kind,target,deadline,status,created_at','created_at','id'):[],
    client.from('preferences').select('theme').maybeSingle(),
    !selection||selection.sync?client.from('sync_state').select('cursor_at,last_error').maybeSingle():{data:null,error:null},
  ]);
  if(prefs.error) readError('preferences',prefs.error.code,'Unable to load workspace settings.');
  if(sync.error) readError('sync_state',sync.error.code,'Unable to load workspace settings.');
  return {workouts,templates,measurements,goals,prefs:prefs.data,sync:sync.data};
}
