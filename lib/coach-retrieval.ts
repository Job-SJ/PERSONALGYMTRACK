import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adaptiveMaintenance} from './adaptive-nutrition';
import {dayKey, shiftDay, weekKey} from './analytics';
import {analyticalQuery, partnerReply, planCoachAnalysis, strengthEvidence, trainingEvidence, type AnalyticalQuery} from './coach-analysis';
import type {ChatTurn} from './coach-chat';
import type {Template,Workout} from './model';
import {portionSchema,portionValues,type Entry} from './nutrition';

const limit=500;
const mean=(values:number[])=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10:null;
const isoDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'});
function midnight(day:string){
  // Amsterdam's UTC offset is either one or two hours at local midnight.
  const candidate=new Date(Date.parse(day)-2*3600000);
  return isoDay.format(candidate)===day?candidate.toISOString():new Date(+candidate+3600000).toISOString();
}
function rows<T>(result:{data:T[]|null;error:unknown}){
  if(result.error) throw new Error('Coach could not read the selected fitness records.');
  return {data:(result.data??[]).slice(0,limit),capped:(result.data?.length??0)>limit};
}

export async function retrieveCoachEvidence(client:SupabaseClient,owner:string,prompt:string,history:ChatTurn[],signal:AbortSignal,
  routed?:AnalyticalQuery['tool'][]){
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(7000)]);
  const today=dayKey(new Date());
  const previous=history.find(turn=>turn.answer)?.prompt??'';
  const plans=planCoachAnalysis(prompt,previous,today,routed);
  const workoutRows=(query:AnalyticalQuery,fields:string)=>client.from('workouts').select(fields).eq('user_id',owner)
    .gte('started_at',midnight(query.from??'1900-01-01')).lt('started_at',midnight(shiftDay(query.through,1)))
    .order('started_at',{ascending:false}).order('id').limit(limit+1).abortSignal(deadline);
  const weights=(query:AnalyticalQuery)=>client.from('body_measurements').select('day,value').eq('user_id',owner)
    .eq('kind','weight').gte('day',query.from??'1900-01-01').lte('day',query.through)
    .order('day',{ascending:false}).limit(limit+1).abortSignal(deadline);
  async function readTraining(query:AnalyticalQuery){
    const training=rows(await workoutRows(query,
      'id,started_at,ended_at,routine_id,workout_exercises(template_id,superset_id,workout_sets(type,weight_kg,reps))'));
    const workouts=training.data as unknown as Workout[];
    const templateIds=[...new Set(workouts.flatMap(row=>row.workout_exercises.map(exercise=>exercise.template_id)))];
    const batches=[];
    for(let index=0;index<Math.min(templateIds.length,500);index+=50){
      batches.push(client.from('exercise_templates').select('id,title,type,primary_muscle,secondary_muscles')
        .eq('user_id',owner).in('id',templateIds.slice(index,index+50)).abortSignal(deadline));
    }
    const templates=new Map<string,Template>();
    for(const batch of await Promise.all(batches)) for(const template of rows(batch).data) templates.set(template.id,template);
    return {workouts,templates,capped:training.capped||templateIds.length>500};
  }
  const trainingByWindow=new Map<string,ReturnType<typeof readTraining>>();
  let firstWorkout:Promise<string|undefined>|undefined;
  async function readFirstWorkout(){
    const result=await client.from('workouts').select('started_at').eq('user_id',owner)
      .order('started_at',{ascending:true}).limit(1).abortSignal(deadline);
    const first=rows(result).data[0];
    return first?dayKey(first.started_at):undefined;
  }
  async function execute(input:AnalyticalQuery){
    const query=analyticalQuery.parse(input);
    const {from,through,tool}=query;
    const window={tool,from,through};
    if(tool==='bodyweight'){
      const sample=rows(await weights(query));
      const latest=sample.data[0];
      const oldest=sample.data.at(-1);
      return {...window,capped:sample.capped,result:{samples:sample.data.length,oldest,latest,
        changeKg:latest&&oldest&&sample.data.length>1?Math.round((latest.value-oldest.value)*10)/10:null}};
    }
    if(tool==='nutrition'){
      const baseline=shiftDay(through,-35);
      const start=from&&from<baseline?from:from?baseline:'1900-01-01';
      const [entries,completed,target,body]=await Promise.all([
        client.from('nutrition_entries').select('day,portion').eq('user_id',owner).gte('day',start).lte('day',through)
          .order('day',{ascending:false}).order('id').limit(limit+1).abortSignal(deadline),
        client.from('nutrition_days').select('day').eq('user_id',owner).gte('day',start).lte('day',through)
          .order('day',{ascending:false}).limit(limit+1).abortSignal(deadline),
        client.from('nutrition_targets').select('day,kcal,protein,carbs,fat').eq('user_id',owner).lte('day',through)
          .order('day',{ascending:false}).limit(1).abortSignal(deadline).maybeSingle(),
        weights({...query,from:baseline}),
      ]);
      const foods=rows(entries);
      const flags=rows(completed);
      const measurements=rows(body);
      if(target.error) throw new Error('Coach could not read the nutrition target.');
      const invalid=new Set<string>();
      if(foods.capped) invalid.add(foods.data.at(-1)!.day);
      if(flags.capped) for(const row of foods.data) if(row.day<flags.data.at(-1)!.day) invalid.add(row.day);
      const valid:Entry[]=foods.data.flatMap(row=>{
        const portion=portionSchema.safeParse(row.portion);
        if(!portion.success){invalid.add(row.day);return [];}
        return [{day:row.day,portion:portion.data} as Entry];
      });
      const complete=flags.data.map(row=>row.day).filter(day=>!invalid.has(day));
      const completeSet=new Set(complete);
      const diary=new Map<string,ReturnType<typeof portionValues>[]>();
      for(const row of valid){
        if(!completeSet.has(row.day)||from&&row.day<from) continue;
        const portions=diary.get(row.day)??[];
        portions.push(portionValues(row.portion));
        diary.set(row.day,portions);
      }
      const nutrients=['kcal','protein','carbs','fat'] as const;
      return {...window,capped:foods.capped||flags.capped,result:{
        completedDaysWithEntries:diary.size,requestedDays:from?(Date.parse(through)-Date.parse(from))/86400000+1:null,
        nutrients:Object.fromEntries(nutrients.map(key=>{
          const totals=[...diary.values()].flatMap(portions=>portions.every(portion=>typeof portion[key]==='number')?
            [portions.reduce((total,portion)=>total+(portion[key]??0),0)]:[]);
          return [key,{days:totals.length,mean:mean(totals)}];
        })),
        target:target.data,maintenance:adaptiveMaintenance(shiftDay(through,1),valid,complete,measurements.data),
      }};
    }
    if(tool==='goals'){
      const [goals,body]=await Promise.all([
        client.from('goals').select('kind,target,deadline,created_at').eq('user_id',owner).eq('status','active')
          .order('created_at',{ascending:false}).order('id').limit(8).abortSignal(deadline),
        weights({...query,from:null}),
      ]);
      if(goals.error) throw new Error('Coach could not read goal progress.');
      const weight=rows(body).data[0]??null;
      const progress=await Promise.all((goals.data??[]).map(async goal=>{
        const {kind,target,deadline:due}=goal;
        if(kind==='weight') return {kind,target,due,latestWeight:weight};
        const created=dayKey(goal.created_at);
        const start=kind==='weekly_workouts'?weekKey(through):created;
        const count=await client.from('workouts').select('id',{count:'exact',head:true}).eq('user_id',owner)
          .gte('started_at',midnight(start)).lt('started_at',midnight(shiftDay(through,1))).abortSignal(deadline);
        if(count.error) throw new Error('Coach could not read workout goal progress.');
        return {kind,target,due,from:start,through,workouts:count.count};
      }));
      return {...window,result:{goals:progress}};
    }
    if(tool==='workouts'||tool==='notes'){
      const sample=rows(await workoutRows(query,'started_at,ended_at,notes,workout_exercises(notes)'));
      const records=sample.data as unknown as {started_at:string;ended_at:string;notes:string|null;workout_exercises:{notes:string|null}[]}[];
      const term=prompt.match(/["“]([^"”]{2,80})["”]/u)?.[1].toLowerCase();
      const relevant=tool==='notes'?records.filter(row=>[row.notes,...row.workout_exercises.map(exercise=>exercise.notes)]
        .some(note=>note&&(term?note.toLowerCase().includes(term):note.trim()))):records;
      return {...window,capped:sample.capped,result:{matchingWorkouts:relevant.length,keywordUsed:Boolean(term),
        recent:relevant.slice(0,10).map(row=>({day:dayKey(row.started_at),
          minutes:Math.round((Date.parse(row.ended_at)-Date.parse(row.started_at))/60000)}))}};
    }
    if(tool==='partners') throw new Error('Partner analysis must stay local.');
    const key=JSON.stringify([from,through]);
    let training=trainingByWindow.get(key);
    if(!training){
      training=readTraining(query);
      trainingByWindow.set(key,training);
    }
    if(tool!=='strength') firstWorkout??=readFirstWorkout();
    const [{workouts,templates,capped},first]=await Promise.all([training,firstWorkout]);
    const relative=tool==='strength'&&/relative strength|body\s?weight|relatieve kracht|lichaamsgewicht/i.test(prompt);
    const body=relative?rows(await weights({...query,from:from?shiftDay(from,-7):null})).data
      .map(row=>({...row,kind:'weight',id:'',source:'recorded'})):[];
    return {...window,capped,result:tool==='strength'?strengthEvidence(workouts,templates,prompt,body,previous):
      trainingEvidence(workouts,templates,query,capped,first)};
  }
  if(plans[0]?.tool==='partners'){
    const query=plans[0];
    const sample=rows(await workoutRows(query,'id,title,started_at,ended_at,notes,workout_exercises(notes)'));
    return {local:partnerReply(sample.data as unknown as Parameters<typeof partnerReply>[0],query,prompt,previous,sample.capped)};
  }
  const results=await Promise.all(plans.map(execute));
  // Never truncate JSON inside an evidence item.
  const evidence:typeof results=[];
  for(const result of results){
    if(new TextEncoder().encode(JSON.stringify([...evidence,result])).length<=5200) evidence.push(result);
  }
  deadline.throwIfAborted();
  return {material:JSON.stringify(evidence),references:evidence.length?{label:evidence.map(result=>
    `${result.tool}: ${result.from??'recorded history'} – ${result.through}`).join(' · '),dates:[]}:undefined};
}
