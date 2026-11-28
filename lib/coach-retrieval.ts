import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adaptiveMaintenance} from './adaptive-nutrition';
import {dayKey, shiftDay, weekKey} from './analytics';
import {analyticalQuery, exerciseMatches, partnerReply, planCoachAnalysis, strengthEvidence, trainingEvidence, type AnalyticalQuery} from './coach-analysis';
import type {ChatTurn} from './coach-chat';
import type {CoachAnalysis} from './coach-tools';
import {discoverPartners,taggedUsernames,type PartnerWorkout} from './coach-partners';
import type {Template,Workout} from './model';
import {portionSchema,portionValues,type Entry} from './nutrition';

const limit=500;
export class CoachEvidenceError extends Error {}
const mean=(values:number[])=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10:null;
const isoDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'});
function midnight(day:string){
  // Amsterdam's UTC offset is either one or two hours at local midnight.
  const candidate=new Date(Date.parse(day)-2*3600000);
  return isoDay.format(candidate)===day?candidate.toISOString():new Date(+candidate+3600000).toISOString();
}
function rows<T>(result:{data:T[]|null;error:unknown}){
  if(result.error) throw new CoachEvidenceError('Coach could not load those fitness records. Retry or choose a shorter date range.');
  return {data:(result.data??[]).slice(0,limit),capped:(result.data?.length??0)>limit};
}

export async function retrieveCoachEvidence(client:SupabaseClient,owner:string,prompt:string,history:ChatTurn[],signal:AbortSignal,
  options?:{queries:CoachAnalysis[];handles:ReadonlyMap<string,string>;aliasFor:(handle:string)=>string}){
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(7000)]);
  const today=dayKey(new Date());
  const previous=history.find(turn=>turn.answer)?.prompt??'';
  const plans:CoachAnalysis[]=options?.queries??planCoachAnalysis(prompt,previous,today);
  async function readPartnerHistory(query:AnalyticalQuery,partnerDeadline:AbortSignal){
    const workouts=new Map<string,PartnerWorkout>();
    const pageSize=200;
    let expected:number|null=null;
    for(let offset=0;;){
      const read=client.from('workouts').select('id,started_at,ended_at,notes',offset===0?{count:'exact'}:{})
        .eq('user_id',owner).lt('started_at',midnight(shiftDay(query.through,1)));
      if(query.from) read.gte('started_at',midnight(query.from));
      const page=await read.order('started_at',{ascending:false}).order('id').range(offset,offset+pageSize-1).abortSignal(partnerDeadline);
      if(page.error||!page.data) throw new CoachEvidenceError('Coach could not read the complete training history. Try again or choose a shorter period.');
      const records=page.data as PartnerWorkout[];
      if(offset===0) expected=page.count;
      if(expected!==null&&expected>10_000) throw new CoachEvidenceError('Choose a shorter period to review up to 10,000 workouts.');
      for(const workout of records){
        if(workouts.has(workout.id)) throw new CoachEvidenceError('Workout history changed during partner analysis. Try again.');
        workouts.set(workout.id,workout);
      }
      offset+=records.length;
      if(!records.length||expected===offset) break;
      partnerDeadline.throwIfAborted();
    }
    if(expected!==workouts.size) throw new CoachEvidenceError('Coach could not verify the complete training history. Try again.');
    partnerDeadline.throwIfAborted();
    return [...workouts.values()];
  }
  if(!options&&plans[0]?.tool==='partners'){
    const query=analyticalQuery.parse(plans[0]);
    const records=await readPartnerHistory(query,AbortSignal.any([signal,AbortSignal.timeout(25000)]));
    return {local:partnerReply(records,query,prompt,previous)};
  }
  const workoutRows=(query:AnalyticalQuery,fields:string)=>client.from('workouts').select(fields).eq('user_id',owner)
    .gte('started_at',midnight(query.from??'1900-01-01')).lt('started_at',midnight(shiftDay(query.through,1)))
    .order('started_at',{ascending:false}).order('id').limit(limit+1).abortSignal(deadline);
  const weights=(query:AnalyticalQuery)=>client.from('body_measurements').select('day,value').eq('user_id',owner)
    .eq('kind','weight').gte('day',query.from??'1900-01-01').lte('day',query.through)
    .order('day',{ascending:false}).limit(limit+1).abortSignal(deadline);
  async function readTraining(query:CoachAnalysis){
    const training=rows(await workoutRows(analyticalQuery.parse({tool:query.tool,from:query.from,through:query.through,compare:query.compare}),
      'id,started_at,ended_at,routine_id'+(query.partner?',notes':'')+',workout_exercises(template_id,superset_id,workout_sets(type,weight_kg,reps))'));
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
  async function execute(input:CoachAnalysis){
    const {from,through,tool,compare}=input;
    const query=analyticalQuery.parse({from,through,tool,compare});
    const window={tool,from,through};
    if(through>today||from&&from<'1900-01-01') return {...window,result:{error:'Choose a recorded date range ending today or earlier.'}};
    const handle=input.partner?options?.handles.get(input.partner):undefined;
    if(input.partner&&!handle) return {...window,result:{error:'The referenced partner could not be resolved. Ask for their workout tag.'}};
    if(handle&&['nutrition','bodyweight','goals'].includes(tool)){
      return {...window,result:{error:'Compare partner tags in workout evidence and use dates for this dataset.'}};
    }
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
      if(target.error) throw new CoachEvidenceError('Coach could not load your nutrition target. Try again.');
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
        if(invalid.has(row.day)||from&&row.day<from) continue;
        const portions=diary.get(row.day)??[];
        portions.push(portionValues(row.portion));
        diary.set(row.day,portions);
      }
      const completedDiary=[...diary].filter(([day])=>completeSet.has(day));
      const nutrients=['kcal','protein','carbs','fat'] as const;
      return {...window,capped:foods.capped||flags.capped,result:{
        loggedDaysWithEntries:diary.size,completedDaysWithEntries:completedDiary.length,
        requestedDays:from?(Date.parse(through)-Date.parse(from))/86400000+1:null,
        selectedDay:from===through?{complete:completeSet.has(through),
          totals:Object.fromEntries(nutrients.map(key=>{
            const portions=diary.get(through)??[];
            return [key,portions.length&&portions.every(portion=>typeof portion[key]==='number')?
              Math.round(portions.reduce((total,portion)=>total+(portion[key]??0),0)*10)/10:null];
          }))}:undefined,
        nutrients:Object.fromEntries(nutrients.map(key=>{
          const totals=completedDiary.flatMap(([,portions])=>portions.every(portion=>typeof portion[key]==='number')?
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
      if(goals.error) throw new CoachEvidenceError('Coach could not load goal progress. Try again.');
      const weight=rows(body).data[0]??null;
      const progress=await Promise.all((goals.data??[]).map(async goal=>{
        const {kind,target,deadline:due}=goal;
        if(kind==='weight') return {kind,target,due,latestWeight:weight};
        const created=dayKey(goal.created_at);
        const start=kind==='weekly_workouts'?weekKey(through):created;
        const count=await client.from('workouts').select('id',{count:'exact',head:true}).eq('user_id',owner)
          .gte('started_at',midnight(start)).lt('started_at',midnight(shiftDay(through,1))).abortSignal(deadline);
        if(count.error) throw new CoachEvidenceError('Coach could not count workouts for your goal. Try again.');
        return {kind,target,due,from:start,through,workouts:count.count};
      }));
      return {...window,result:{goals:progress}};
    }
    if(tool==='workouts'||tool==='notes'){
      const fields='started_at,ended_at'+(tool==='notes'?',notes,workout_exercises(notes)':handle?',notes':'');
      const sample=rows(await workoutRows(query,fields));
      const records=sample.data as unknown as Workout[];
      const term=input.noteContains?.toLowerCase();
      const relevant=tool==='notes'?records.filter(row=>[row.notes,...(row.workout_exercises??[]).map(exercise=>exercise.notes)]
        .some(note=>note&&(term?note.toLowerCase().includes(term):note.trim()))):records;
      const summarize=(group:Workout[])=>({matchingWorkouts:group.length,recent:group.slice(0,10).map(row=>({
        day:dayKey(row.started_at),minutes:Math.round((Date.parse(row.ended_at)-Date.parse(row.started_at))/60000),
      }))});
      const tagged=handle?relevant.filter(row=>taggedUsernames(row.notes??'').has(handle)):[];
      const taggedRows=new Set(tagged);
      return {...window,capped:sample.capped,result:handle?{partner:input.partner,keywordUsed:Boolean(term),
        tagged:summarize(tagged),other:summarize(relevant.filter(row=>!taggedRows.has(row)))}:{keywordUsed:Boolean(term),...summarize(relevant)}};
    }
    if(tool==='partners'){
      const records=await readPartnerHistory(query,deadline);
      const cohort=records.filter(row=>handle?taggedUsernames(row.notes??'').has(handle):taggedUsernames(row.notes??'').size>0);
      const selected=new Set(cohort.map(row=>row.id));
      const other=records.filter(row=>!selected.has(row.id));
      const summarize=(sample:PartnerWorkout[])=>({workouts:sample.length,meanDurationMinutes:mean(sample.map(row=>
        (Date.parse(row.ended_at)-Date.parse(row.started_at))/60000).filter(minutes=>minutes>0))});
      const ranking=discoverPartners(records).partners;
      return {...window,result:{workoutsReviewed:records.length,partner:input.partner,tagged:summarize(cohort),other:summarize(other),
        partnerCount:ranking.length,partners:(handle?ranking.filter(row=>row.username===handle):ranking).slice(0,8)
          .map(row=>({partner:options?.aliasFor(row.username),workouts:row.count,lastTaggedDay:row.last,sharePercent:Math.round(row.percentage*100)/100}))}};
    }
    const key=JSON.stringify([from,through,Boolean(handle)]);
    let training=trainingByWindow.get(key);
    if(!training){
      training=readTraining({...query,partner:input.partner});
      trainingByWindow.set(key,training);
    }
    if(tool!=='strength') firstWorkout??=readFirstWorkout();
    const [{workouts,templates,capped},first]=await Promise.all([training,firstWorkout]);
    const relative=tool==='strength'&&input.relative;
    const body=relative?rows(await weights({...query,from:from?shiftDay(from,-7):null})).data
      .map(row=>({...row,kind:'weight',id:'',source:'recorded'})):[];
    const exercise=input.exercise;
    const cohort=handle?new Set(workouts.filter(row=>taggedUsernames(row.notes??'').has(handle)).map(row=>row.id)):undefined;
    const summarize=(sample:Workout[])=>{
      const selected=exercise?sample.flatMap(row=>{
        const exercises=row.workout_exercises.filter(item=>exerciseMatches(templates.get(item.template_id)?.title??'',exercise));
        return exercises.length?[{...row,workout_exercises:exercises}]:[];
      }):sample;
      return trainingEvidence(selected,templates,query,capped,first);
    };
    return {...window,capped,result:tool==='strength'?strengthEvidence(workouts,templates,prompt,body,previous,
      {exercise:input.exercise,reps:input.reps,cohort}):cohort?{partner:input.partner,
        tagged:summarize(workouts.filter(row=>cohort.has(row.id))),other:summarize(workouts.filter(row=>!cohort.has(row.id)))}:summarize(workouts)};
  }
  const results=await Promise.all(plans.map(execute));
  // Never truncate JSON inside an evidence item.
  const evidence:typeof results=[];
  for(const result of results){
    if(new TextEncoder().encode(JSON.stringify([...evidence,result])).length<=5200) evidence.push(result);
  }
  deadline.throwIfAborted();
  return {material:JSON.stringify({results:evidence,omitted:results.length-evidence.length}),references:results.length?{label:results.map(result=>
    `${result.tool}: ${result.from??'recorded history'} – ${result.through}${'capped' in result&&result.capped?' (bounded sample)':''}`).join(' · '),dates:[]}:undefined};
}
