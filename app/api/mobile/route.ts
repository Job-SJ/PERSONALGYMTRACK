import {z} from 'zod';
import {apiSession,privateJson,readJson} from '../../../lib/api-session';
import {bestRecords,dayKey,shiftDay,workoutMetrics} from '../../../lib/analytics';
import {dailyIntelligence} from '../../../lib/daily-intelligence';
import {integrationCredentials} from '../../../lib/integration-credentials';
import {lookupFoods,writeNutrition} from '../../../lib/nutrition-service';
import {runSync} from '../../../lib/sync';
import {HevyError} from '../../../lib/hevy';
import type {Entry,Target} from '../../../lib/nutrition';
import type {Measurement,Template,Workout} from '../../../lib/model';
import type {MobileOverview} from '../../../lib/mobile-contract';

export const maxDuration=120;

export async function GET(request:Request){
  const auth=await apiSession(request);
  if(auth.response) return auth.response;
  const {client}=auth.session;
  const today=dayKey(new Date());
  const start=shiftDay(today,-60);
  try{
    const [workouts,templates,body,nutrition,target,complete,prefs,hevyConnected]=await Promise.all([
      client.from('workouts').select('id,title,started_at,ended_at,workout_exercises(position,title,template_id,workout_sets(position,type,weight_kg,reps))')
        .gte('started_at',shiftDay(start,-1)).order('started_at',{ascending:false}).order('id').limit(120),
      client.from('exercise_templates').select('id,title,type,primary_muscle,secondary_muscles').order('id').limit(1000),
      client.from('body_measurements').select('day,kind,value').eq('kind','weight').gte('day',start).lte('day',today).order('day',{ascending:false}).limit(120),
      client.from('nutrition_entries').select('id,day,meal,portion,created_at').eq('day',today).order('created_at').order('id').limit(100),
      client.from('nutrition_targets').select('day,kcal,protein,carbs,fat').lte('day',today).order('day',{ascending:false}).limit(1).maybeSingle(),
      client.from('nutrition_days').select('day').eq('day',today).maybeSingle(),
      client.from('preferences').select('theme').maybeSingle(),
      integrationCredentials(auth.session,'hevy').connected().catch(()=>false),
    ]);
    if([workouts,templates,body,nutrition,target,complete,prefs].some(result=>result.error)) return privateJson({error:'The mobile workspace could not be loaded.'},503);
    const training=(workouts.data??[]) as Workout[];
    const weights=(body.data??[]) as Measurement[];
    const map=new Map(((templates.data??[]) as Template[]).map(row=>[row.id,row]));
    const report=dailyIntelligence({workouts:training,templates:map,measurements:weights,records:bestRecords(training,map),today,days:30});
    const overview:MobileOverview={
      today,workouts:training.slice(0,30).map(row=>{
        const {sets,volume,minutes}=workoutMetrics(row,map);
        return {id:row.id,title:row.title,day:dayKey(row.started_at),sets,volume,minutes};
      }),weight:weights.map(({day,value})=>({day,value})),headlines:report.indicators.map(({label,value})=>({label,value})),
      summary:report.headline,entries:(nutrition.data??[]) as Entry[],target:target.data as Target|null,
      complete:Boolean(complete.data),theme:prefs.data?.theme??'dark',hevyConnected,
    };
    return privateJson(overview);
  }catch{return privateJson({error:'The mobile workspace could not be loaded.'},503);}
}

const commands=z.discriminatedUnion('action',[
  z.object({action:z.literal('nutrition'),command:z.unknown()}),
  z.object({action:z.literal('food-search'),mode:z.enum(['name','brand','barcode']),query:z.string().trim().min(2).max(80)}),
  z.object({action:z.literal('weight'),day:z.iso.date(),kg:z.number().positive().max(700)}),
  z.object({action:z.literal('theme'),theme:z.enum(['dark','light','oled'])}),
  z.object({action:z.literal('sync')}),
]);

export async function POST(request:Request){
  const auth=await apiSession(request);
  if(auth.response) return auth.response;
  const input=commands.safeParse(await readJson(request,32768));
  if(!input.success) return privateJson({error:'Choose a valid workspace action.'},400);
  const {client,user}=auth.session;
  const command=input.data;
  try{
    switch(command.action){
      case 'nutrition':{
        const result=await writeNutrition(client,user.id,command.command);
        return privateJson(result,result.ok?200:400);
      }
      case 'food-search':{
        const result=await lookupFoods(command.mode,command.query);
        return privateJson(result,result.error?502:200);
      }
      case 'weight':{
        if(command.day>dayKey(new Date())) return privateJson({error:'Choose today or a past date.'},400);
        const insert=await client.from('body_measurements').insert({user_id:user.id,day:command.day,kind:'weight',value:command.kg,source:'manual'});
        const result=insert.error?.code==='23505'?await client.from('body_measurements').update({value:command.kg})
          .eq('user_id',user.id).eq('day',command.day).eq('kind','weight').eq('source','manual').select('id').single():insert;
        if(result.error) return privateJson({error:'Bodyweight could not be saved.'},400);
        break;
      }
      case 'theme':{
        const result=await client.from('preferences').upsert({user_id:user.id,theme:command.theme});
        if(result.error) return privateJson({error:'Theme could not be saved.'},400);
        break;
      }
      case 'sync':{
        const key=await integrationCredentials(auth.session,'hevy').read();
        if(!key) return privateJson({error:'Connect Hevy in the web workspace first.'},400);
        await runSync(client,user.id,key);
        break;
      }
    }
    return privateJson({ok:true});
  }catch(error){return privateJson({error:error instanceof HevyError?error.message:'The workspace action could not be completed.'},503);}
}
