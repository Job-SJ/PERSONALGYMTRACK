import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {dayKey,shiftDay} from './analytics';
import {coachingContext} from './coach-context';
import type {Topic} from './coach-topics';
import type {Goal,Measurement,Template,Workout} from './model';
import {portionSchema,type Entry,type Target} from './nutrition';

export async function loadCoachingContext(client:SupabaseClient,topic:Topic){
  const today=dayKey(new Date());
  const start=shiftDay(today,-60);
  const [training,templates,body,diary,complete,targets,goals]=await Promise.all([
    client.from('workouts').select('id,started_at,ended_at,workout_exercises(position,title,template_id,workout_sets(position,type,weight_kg,reps))')
      .gte('started_at',shiftDay(start,-1)).order('started_at',{ascending:false}).order('id').limit(180),
    client.from('exercise_templates').select('id,title,type,primary_muscle,secondary_muscles').order('id').limit(1000),
    client.from('body_measurements').select('day,kind,value').eq('kind','weight').gte('day',start).lt('day',today).order('day',{ascending:false}).limit(120),
    client.from('nutrition_entries').select('day,portion').gte('day',start).lt('day',today).order('day',{ascending:false}).order('id').limit(1000),
    client.from('nutrition_days').select('day').gte('day',start).lt('day',today).limit(60),
    client.from('nutrition_targets').select('day,kcal,protein,carbs,fat').lte('day',today).order('day',{ascending:false}).limit(1).maybeSingle(),
    client.from('goals').select('kind,target,deadline,status').eq('status','active').order('created_at',{ascending:false}).limit(5),
  ]);
  if([training,templates,body,diary,complete,targets,goals].some(result=>result.error)) throw new Error('Coaching data is unavailable.');
  const rows=diary.data??[];
  const incomplete=new Set<string>();
  const entries=rows.flatMap(row=>{
    const portion=portionSchema.safeParse(row.portion);
    if(!portion.success){incomplete.add(row.day);return [];}
    return [{day:row.day,portion:portion.data} as Entry];
  });
  if(rows.length===1000) incomplete.add(rows.at(-1)!.day);
  return coachingContext({
    today,workouts:(training.data??[]) as Workout[],templates:(templates.data??[]) as Template[],
    weights:(body.data??[]) as Measurement[],entries,
    completed:(complete.data??[]).map(row=>row.day).filter(day=>!incomplete.has(day)),
    target:targets.data as Target|null,goals:(goals.data??[]) as Goal[],
    capped:training.data?.length===180||rows.length===1000||templates.data?.length===1000,
  },topic);
}
