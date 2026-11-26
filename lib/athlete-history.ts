import {bestRecords,dayKey,estimate,loaded,muscleKey,muscles,relativeStrength,shiftDay,sum,volume,weekKey,working,workoutMetrics} from './analytics';
import {formatDate,formatNumber,formatPercent,type Locale} from './format';
import type {Measurement,Template,Workout} from './model';
import {safePassportText,type PassportFact} from './passport';

export type HistoryInput={workouts:Workout[];templates:Map<string,Template>;measurements:Measurement[];today:string;locale:Locale};
type Session={day:string;workout:Workout};
type Lift={id:string;name:string;days:Map<string,Observation>};
type Observation={day:string;at:string;estimated:number|null;load:number};
type Window={from:string;to:string};
export const replayLengths=[30,90,180] as const;
const DAY=86_400_000;
const daysBetween=(start:string,end:string)=>(Date.parse(end)-Date.parse(start))/DAY;
const median=(values:number[])=>{
  const sorted=[...values].sort((a,b)=>a-b), middle=Math.floor(sorted.length/2);
  return sorted.length?sorted.length%2?sorted[middle]:(sorted[middle]+sorted[middle-1])/2:null;
};
const percentChange=(value:number,baseline:number)=>value/baseline-1;
const clamp=(value:number,low=0,high=100)=>Math.min(high,Math.max(low,value));
const chronological=(rows:Observation[])=>rows.sort((a,b)=>a.day.localeCompare(b.day));
const inWindow=(day:string,window:Window)=>day>=window.from&&day<=window.to;
const summaries=(points:Observation[],window:Window)=>points.filter(point=>inWindow(point.day,window));

function sessionsFor(workouts:Workout[],today:string){
  return workouts.map(workout=>({workout,day:dayKey(workout.started_at)})).filter(row=>row.day<=today)
    .sort((a,b)=>Date.parse(a.workout.started_at)-Date.parse(b.workout.started_at)||a.workout.id.localeCompare(b.workout.id));
}

function liftHistory(sessions:Session[],templates:Map<string,Template>,only?:string){
  const lifts=new Map<string,Lift>();
  for(const {day,workout} of sessions) for(const exercise of workout.workout_exercises){
    const id=exercise.template_id, template=templates.get(id);
    if((only&&id!==only)||!loaded(template)) continue;
    let estimated:number|null=null, load=0;
    for(const set of exercise.workout_sets){
      const weight=set.weight_kg??0, repetitions=set.reps??0;
      if(!working(set)||!Number.isFinite(weight)||weight<=0||repetitions<=0) continue;
      const value=estimate(weight,repetitions);
      if(value!=null&&(estimated==null||value>estimated)) estimated=value;
      load=Math.max(load,weight);
    }
    if(!load) continue;
    const lift=lifts.get(id)??{id,name:template?.title||exercise.title,days:new Map()};
    const old=lift.days.get(day);
    const better=!old||(estimated??0)>(old.estimated??0);
    lift.days.set(day,{day,at:better?workout.started_at:old.at,
      estimated:better?estimated:old.estimated,load:Math.max(load,old?.load??0)});
    lifts.set(id,lift);
  }
  return [...lifts.values()];
}

const validDate=(value?:string)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export function replayWindows(first:string,last:string,length:number,early?:string,late?:string){
  const bounded=(date:string)=>date<first?first:date>last?last:date;
  const latest=validDate(late)?bounded(late!):last;
  const recent={from:shiftDay(latest,1-length),to:latest};
  const priorLimit=shiftDay(recent.from,-1);
  const earliest=validDate(early)?bounded(early!):bounded(shiftDay(first,length-1));
  const earlier=earliest>priorLimit?priorLimit:earliest;
  const baseline={from:shiftDay(earlier,1-length),to:earlier};
  return {baseline,recent,first,last,canCompare:baseline.to>=first};
}

const numeric=(points:Observation[],value:(point:Observation)=>number|null)=>points.flatMap(point=>value(point)??[]);
export function performanceReplay(input:HistoryInput,options:{exercise?:string;length?:string;early?:string;late?:string}){
  const {workouts,templates,measurements,today,locale}=input;
  const sessions=sessionsFor(workouts,today);
  if(!sessions.length) return null;
  const catalog=new Map<string,{id:string;name:string;days:Set<string>}>();
  for(const {day,workout} of sessions) for(const exercise of workout.workout_exercises){
    const template=templates.get(exercise.template_id);
    if(!loaded(template)||!exercise.workout_sets.some(set=>working(set)&&(set.weight_kg??0)>0&&(set.reps??0)>0)) continue;
    const option=catalog.get(exercise.template_id)??{id:exercise.template_id,name:template?.title||exercise.title,days:new Set()};
    option.days.add(day);
    catalog.set(option.id,option);
  }
  const exercises=[...catalog.values()].sort((a,b)=>b.days.size-a.days.size||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map(({id,name})=>({id,name}));
  const selected=exercises.find(item=>item.id===options.exercise)??exercises[0];
  const length=replayLengths.find(value=>String(value)===options.length)??90;
  const windows=replayWindows(sessions[0].day,sessions.at(-1)!.day,length,options.early,options.late);
  const included=sessions.filter(row=>row.day<=windows.recent.to);
  const points=selected?chronological([...(liftHistory(included,templates,selected.id)[0]?.days.values()??[])]):[];
  const weights=new Map<string,Measurement>();
  for(const row of measurements){
    if(row.kind==='weight'&&Number.isFinite(row.value)&&row.value>0&&!weights.has(row.day)) weights.set(row.day,row);
  }
  const withWeight=new Map(points.map(point=>{
    for(let offset=0;offset<=7;offset++){
      const weight=weights.get(shiftDay(point.day,-offset));
      if(weight) return [point.day,relativeStrength(point.estimated??0,point.at,[weight])] as const;
    }
    return [point.day,null] as const;
  }));
  const compare=(window:Window)=>{
    const rows=summaries(points,window);
    const estimates=numeric(rows,p=>p.estimated);
    const weights=numeric(rows,p=>p.load);
    const relatives=numeric(rows,p=>withWeight.get(p.day)??null);
    return {estimated:median(estimates),load:weights.length?Math.max(...weights):null,relative:median(relatives),dates:estimates.length,relativeDates:relatives.length,
      workouts:0,volume:null as number|null};
  };
  const baseline=compare(windows.baseline),recent=compare(windows.recent);
  const records=selected?bestRecords(included.map(({workout})=>({...workout,
    workout_exercises:workout.workout_exercises.filter(exercise=>exercise.template_id===selected.id)})),templates)
    .filter(record=>record.previous!=null&&(record.metric==='Estimated 1RM'||record.metric==='Max weight')):[];
  const recordDays=new Map<string,Set<string>>();
  for(const record of records){
    const day=dayKey(record.at);
    const onDay=recordDays.get(day)??new Set();
    onDay.add(record.metric);
    recordDays.set(day,onDay);
  }
  function strengthSeries(value:(point:Observation)=>number|null,metric:string){
    const buckets=new Map<string,{at:string;label:string;value:number;record:boolean}>();
    for(const point of points){
      const amount=value(point);
      if(amount==null) continue;
      const key=points.length>500?point.day.slice(0,7):points.length>180?weekKey(point.day):point.day;
      if(amount>(buckets.get(key)?.value??-Infinity)) buckets.set(key,{
        at:point.day,label:formatDate(point.day,locale),value:amount,record:recordDays.get(point.day)?.has(metric)??false,
      });
    }
    return [...buckets.values()];
  }
  const firstWeek=weekKey(windows.first),lastWeek=weekKey(windows.recent.to);
  const monthly=daysBetween(firstWeek,lastWeek)>7*156;
  const bucketFor=(day:string)=>monthly?day.slice(0,7)+'-01':weekKey(day);
  const nextBucket=(day:string)=>monthly?new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),1)).toISOString().slice(0,10):shiftDay(day,7);
  const totals=new Map<string,{count:number;load:number|null;incomplete:boolean}>();
  for(let day=bucketFor(windows.first);day<=windows.recent.to;day=nextBucket(day)){
    totals.set(day,{count:0,load:null,incomplete:day<windows.first||shiftDay(nextBucket(day),-1)>windows.recent.to});
  }
  for(const {day,workout} of included){
    const row=totals.get(bucketFor(day))!;
    row.count++;
    const load=workoutMetrics(workout,templates).volume;
    if(load!=null) row.load=(row.load??0)+load;
    if(inWindow(day,windows.baseline)){
      baseline.workouts++;
      if(load!=null) baseline.volume=(baseline.volume??0)+load;
    }else if(inWindow(day,windows.recent)){
      recent.workouts++;
      if(load!=null) recent.volume=(recent.volume??0)+load;
    }
  }
  const periods=[...totals].map(([at,row])=>({at,label:formatDate(at,locale,monthly?{month:'short',year:'numeric'}:undefined),...row}));
  const series=[
    {key:'estimated',label:'Estimated 1RM',unit:'kg',detailScale:true,observedOnly:true,points:strengthSeries(p=>p.estimated,'Estimated 1RM')},
    {key:'load',label:'Recorded max load',unit:'kg',detailScale:true,observedOnly:true,points:strengthSeries(p=>p.load,'Max weight')},
    {key:'relative',label:'Relative estimated strength',unit:'× bodyweight',detailScale:true,observedOnly:true,points:strengthSeries(p=>withWeight.get(p.day)??null,'')},
    {key:'frequency',label:monthly?'Workouts per month':'Workouts per week',unit:'workouts',observedOnly:true,points:periods.map(({at,label,count,incomplete})=>({at,label,value:count,incomplete}))},
    {key:'volume',label:monthly?'Volume per month':'Volume per week',unit:'kg × reps',observedOnly:true,points:periods.flatMap(({at,label,load,incomplete})=>load!=null?[{at,label,value:load,incomplete}]:[])},
  ].filter(item=>item.points.length);
  const seen=new Set<string>();
  const milestones=records.filter(record=>{
    const key=record.metric+'|'+dayKey(record.at);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,10).reverse()
    .map(record=>({day:dayKey(record.at),title:record.metric==='Max weight'?'Recorded load record':'Estimated 1RM record',
      detail:formatNumber(record.value,1,locale)+' kg',href:'/app/workouts/'+encodeURIComponent(record.workout)+'#exercise-'+record.exercisePosition}));
  return {windows,length,exercises,selected,baseline,recent,series,milestones,
    sampled:points.length>180,monthly};
}

export function passportFacts({workouts,templates,measurements,today,locale}:HistoryInput):PassportFact[]{
  const sessions=sessionsFor(workouts,today);
  if(!sessions.length) return [];
  const number=(value:number,digits=0)=>formatNumber(value,digits,locale);
  const facts:PassportFact[]=[];
  const lifts=liftHistory(sessions,templates).sort((a,b)=>b.days.size-a.days.size||a.name.localeCompare(b.name));
  for(const lift of lifts){
    const name=safePassportText(lift.name);
    if(!name||name===lift.id) continue;
    const points=chronological([...lift.days.values()]);
    const best=points.reduce((max,point)=>(point.estimated??0)>(max.estimated??0)?point:max);
    if(best.estimated!=null) facts.push({key:'estimate',label:'Estimated max · '+name,value:number(best.estimated,1)+' kg'});
    const highest=Math.max(...points.map(point=>point.load??0));
    if(highest>0) facts.push({key:'recorded',label:'Recorded max · '+name,value:number(highest,1)+' kg'});
    const relative=relativeStrength(best.estimated??0,best.at,measurements);
    if(relative!=null) facts.push({key:'relative',label:'Estimated max relative to bodyweight',value:number(relative,2)+'×'});
    const first=median(numeric(points.slice(0,3),p=>p.estimated)),last=median(numeric(points.slice(-3),p=>p.estimated));
    if(points.length>=6&&first!=null&&last!=null&&numeric(points,p=>p.estimated).length===points.length){
      facts.push({key:'progress',label:'First vs latest 3 dates · '+name,value:formatPercent(percentChange(last,first),locale)});
    }
    const records=bestRecords(sessions.map(({workout})=>({...workout,workout_exercises:workout.workout_exercises.filter(exercise=>exercise.template_id===lift.id)})),templates)
      .filter(record=>record.previous!=null&&record.metric==='Max weight');
    if(records.length) facts.push({key:'milestone',label:'Recorded load records · '+name,value:number(records.length)});
    break;
  }
  facts.push({key:'workouts',label:'Recorded workouts',value:number(sessions.length)});
  const history=daysBetween(sessions[0].day,sessions.at(-1)!.day)+1;
  facts.push({key:'history',label:'Recorded training history',value:number(history)+' '+(history===1?'day':'days')});
  const time=sum(sessions.map(({workout})=>Math.max(0,(Date.parse(workout.ended_at)-Date.parse(workout.started_at))/3_600_000)).filter(Number.isFinite));
  if(time>0) facts.push({key:'time',label:'Recorded training time',value:number(time,1)+' h'});
  const counts=new Map<string,number>(), direct=new Map<string,number>();
  for(const {workout} of sessions){
    const unique=new Set<string>();
    for(const exercise of workout.workout_exercises){
      const template=templates.get(exercise.template_id);
      const name=safePassportText(template?.title||exercise.title);
      if(name&&name!==exercise.template_id) unique.add(name);
      const group=muscleKey(template?.primary_muscle);
      if(Object.hasOwn(muscles,group)) direct.set(group,(direct.get(group)??0)+exercise.workout_sets.filter(working).length);
    }
    for(const name of unique) counts.set(name,(counts.get(name)??0)+1);
  }
  const frequent=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
  const most=[...direct].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
  if(frequent) facts.push({key:'exercise',label:'Most frequent exercise',value:frequent[0]});
  if(most?.[1]) facts.push({key:'muscle',label:'Most direct working sets',value:muscles[most[0] as keyof typeof muscles]});
  const weight=measurements.filter(row=>row.kind==='weight'&&row.day<=today&&Number.isFinite(row.value)&&row.value>0)
    .sort((a,b)=>b.day.localeCompare(a.day)||a.id.localeCompare(b.id))[0];
  if(weight) facts.push({key:'weight',label:'Latest recorded bodyweight',value:number(weight.value,1)+' kg'});
  return facts;
}

export const fingerprintAxes=[
  {key:'strength',label:'Strength progression',method:'Median change in estimated 1RM across matched lifts. Each lift needs 3 distinct dates in both periods. Flat is 50; ±10% maps to the ends.'},
  {key:'volume',label:'Training volume',method:'Positive mapped working-set load × reps versus the preceding equal period. Two workouts with measured load and at least 75% coverage are needed in each period. Equal volume is 50; half or double is 0 or 100.'},
  {key:'consistency',label:'Consistency',method:'Evenness of training dates across seven-day buckets, with 0 for all dates in one bucket and 100 for equal counts across buckets.'},
  {key:'balance',label:'Muscle group balance',method:'Spread of mapped direct working sets across 11 regions. One region is 0; equal shares across all regions is 100. At least 12 mapped sets and 75% of working sets mapped are required.'},
  {key:'progression',label:'Progression patterns',method:'Share of consecutive comparable lift dates with a heavier maximum recorded working-set load. Requires at least 6 pairs at most 21 days apart.'},
  {key:'frequency',label:'Training frequency',method:'Share of calendar days with at least one recorded workout. Multiple workouts on a single date count once.'},
] as const;
export const fingerprintPeriods=[28,56,84] as const;
type AxisKey=typeof fingerprintAxes[number]['key'];
type Scores=Record<AxisKey,number|null>;
const noScores=():Scores=>({strength:null,volume:null,consistency:null,balance:null,progression:null,frequency:null});

function fingerprintWindow(sessions:Session[],lifts:Lift[],templates:Map<string,Template>,period:Window,days:number){
  const rows=sessions.filter(row=>inWindow(row.day,period));
  const dates=[...new Set(rows.map(row=>row.day))];
  const weekly=Array<number>(days/7).fill(0);
  for(const day of dates) weekly[Math.floor(daysBetween(period.from,day)/7)]++;
  let mapped=0, workingSets=0, measured=0, total=0;
  const groups=new Map<string,number>();
  for(const {workout} of rows){
    let sessionVolume=0;
    for(const exercise of workout.workout_exercises){
      const template=templates.get(exercise.template_id), group=muscleKey(template?.primary_muscle);
      for(const set of exercise.workout_sets){
        if(!working(set)) continue;
        workingSets++;
        if(Object.hasOwn(muscles,group)){
          groups.set(group,(groups.get(group)??0)+1);
          mapped++;
        }
        const load=volume(set,template);
        if(load!=null&&Number.isFinite(load)&&load>0) sessionVolume+=load;
      }
    }
    if(sessionVolume>0){total+=sessionVolume;measured++;}
  }
  const estimates=new Map<string,number>();
  let pairs=0,increases=0;
  for(const lift of lifts){
    const points=summaries([...lift.days.values()],period);
    const estimated=points.filter(point=>point.estimated!=null);
    if(estimated.length>=3&&daysBetween(estimated[0].day,estimated.at(-1)!.day)>=7){
      const middle=median(numeric(estimated,point=>point.estimated));
      if(middle!=null) estimates.set(lift.id,middle);
    }
    for(let i=1;i<points.length;i++){
      if(daysBetween(points[i-1].day,points[i].day)>21) continue;
      pairs++;
      if(points[i].load>points[i-1].load) increases++;
    }
  }
  if(dates.length<4) return {scores:noScores(),estimates,total:null,dates:dates.length};
  const difference=sum(weekly.flatMap(a=>weekly.map(b=>Math.abs(a-b))));
  const evenness=1-difference/(2*(weekly.length-1)*dates.length);
  const concentration=mapped?sum([...groups.values()].map(count=>(count/mapped)**2)):1;
  const balance=(1-concentration)/(1-1/Object.keys(muscles).length);
  return {scores:{...noScores(),consistency:clamp(evenness*100),
    balance:mapped>=12&&mapped/workingSets>=0.75?clamp(balance*100):null,
    progression:pairs>=6?100*increases/pairs:null,frequency:100*dates.length/days},
    estimates,total:measured>=2&&measured/rows.length>=0.75?total:null,dates:dates.length};
}

export function athleteArchetype(scores:Scores){
  if(Object.values(scores).filter(score=>score!=null).length<3) return null;
  if(scores.strength!=null&&scores.strength>=65&&scores.progression!=null&&scores.progression>=50)
    return {title:'The Progressive Lifter',reason:'Estimated strength rose on comparable lifts, and heavier working loads appeared often across repeat dates.'};
  if(scores.balance!=null&&scores.balance>=70)
    return {title:'The Balanced Athlete',reason:'Your mapped direct sets were spread across several muscle groups in this period.'};
  if(scores.consistency!=null&&scores.consistency>=80)
    return {title:'The Consistent Athlete',reason:'Recorded training dates were distributed evenly across the weeks in this period.'};
  if(scores.volume!=null&&scores.volume>=65)
    return {title:'The Volume Builder',reason:'Recorded working-set volume was higher than in your preceding period.'};
  if(scores.frequency!=null&&scores.frequency>=50)
    return {title:'The Frequency Specialist',reason:'You logged workouts on at least half of the dates in this period.'};
  return {title:'The All-Rounder',reason:'The available dimensions describe a mix of training patterns during this period.'};
}

export function trainingFingerprint({workouts,templates,today}:HistoryInput,selected?:string){
  const days=fingerprintPeriods.find(period=>String(period)===selected)??28;
  const sessions=sessionsFor(workouts,shiftDay(today,-1));
  const start=shiftDay(today,-3*days);
  const bounded=sessions.filter(row=>row.day>=start);
  const lifts=liftHistory(bounded,templates);
  const window=(offset:number)=>({from:shiftDay(today,-days*(offset+1)),to:shiftDay(today,-days*offset-1)});
  const blocks=[0,1,2].map(offset=>fingerprintWindow(bounded,lifts,templates,window(offset),days));
  function score(index:number):Scores{
    const block=blocks[index],previous=blocks[index+1],scores={...block.scores};
    if(block.dates<4||previous.dates<4||!sessions[0]||sessions[0].day>window(index+1).from) return scores;
    const changes=[...block.estimates].flatMap(([id,value])=>previous.estimates.has(id)?[percentChange(value,previous.estimates.get(id)!)]:[]);
    const strength=median(changes);
    if(strength!=null) scores.strength=clamp(50+500*strength);
    if(block.total!=null&&previous.total!=null&&previous.total>0) scores.volume=clamp(50+50*Math.log2(block.total/previous.total));
    return scores;
  }
  const current=score(0),previous=score(1);
  const archiveCovered=sessions.length>0&&sessions[0].day<=window(1).from;
  return {days,current,previous:archiveCovered?previous:noScores(),archetype:athleteArchetype(current),
    currentDates:blocks[0].dates,previousDates:archiveCovered?blocks[1].dates:null};
}
