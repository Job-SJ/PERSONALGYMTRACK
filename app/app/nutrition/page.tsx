import {Shell} from '../../../components/shell';
import {Nutrition} from '../../../components/nutrition';
import {configured,session} from '../../../lib/supabase';
import {dataFor,read} from '../../../lib/data';
import {dayKey,estimate,loaded,relativeStrength,working} from '../../../lib/analytics';
import type {Entry,LibraryItem,Target} from '../../../lib/nutrition';
import type {StrengthPoint} from '../../../components/nutrition-charts';

export default async function NutritionPage(){
  const today=dayKey(new Date());
  if(!configured()) return <Shell preview previewTab="nutrition">
    <Nutrition today={today} entries={[]} targets={[]} library={[]} complete={[]} weights={[]} strength={[]} setup/>
  </Shell>;
  const {client}=await session();
  const data=await dataFor(client);
  const theme=data.prefs?.theme??'dark';
  const checks=await Promise.all(['nutrition_entries','nutrition_library','nutrition_targets','nutrition_days']
    .map(table=>client.from(table).select(table==='nutrition_library'?'id':'day').limit(0)));
  const errors=checks.flatMap(result=>result.error??[]);
  if(errors.some(error=>error.code==='PGRST205'||error.code==='42P01')) return <Shell theme={theme}>
    <div className="heading"><div><h1>Nutrition</h1><p>Food diary and intake trends.</p></div></div>
    <p className="notice" role="status">Apply 202611260001_nutrition.sql in Supabase to enable the nutrition diary.</p>
  </Shell>;
  if(errors.length) throw new Error('Unable to load private nutrition data.');
  const [entries,library,targets,days]=await Promise.all([
    read<Entry>(client,'nutrition_entries','id,day,meal,portion,created_at','day','id'),
    read<LibraryItem>(client,'nutrition_library','id,name,kind,portions,servings','name','id'),
    read<Target>(client,'nutrition_targets','day,kcal,protein,carbs,fat','day'),
    read<{day:string}>(client,'nutrition_days','day','day'),
  ]);
  const weights=data.measurements.filter(row=>row.kind==='weight'&&row.value>0);
  const templates=new Map(data.templates.map(template=>[template.id,template]));
  const points=new Map<string,StrengthPoint>();
  for(const workout of data.workouts) for(const exercise of workout.workout_exercises){
    if(!loaded(templates.get(exercise.template_id))) continue;
    const absolute=Math.max(0,...exercise.workout_sets.filter(working).map(set=>estimate(set.weight_kg??0,set.reps??0)??0));
    if(!absolute) continue;
    const day=dayKey(workout.started_at);
    const key=JSON.stringify([exercise.template_id,day]);
    if(absolute>(points.get(key)?.absolute??0)) points.set(key,{
      day,id:exercise.template_id,name:exercise.title,absolute,relative:relativeStrength(absolute,workout.started_at,weights),
    });
  }
  return <Shell theme={theme}><Nutrition today={today} entries={entries} targets={targets} library={library}
    complete={days.map(row=>row.day)} weights={weights} strength={[...points.values()]}/></Shell>;
}
