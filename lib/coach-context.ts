import {z} from 'zod';
import {bestRecords,dayKey,estimate,loaded,movingAverage,muscleTotals,shiftDay,working,workoutMetrics} from './analytics';
import {dailyIntelligence} from './daily-intelligence';
import {adaptiveMaintenance} from './adaptive-nutrition';
import {diaryCalories,portionValues,type Entry,type Target} from './nutrition';
import type {Goal,Measurement,Template,Workout} from './model';
import {topics,type Topic} from './coach-topics';
export {coachPersonality as coachInstructions} from './coach-personality';

const round=(value:number|null)=>value==null||!Number.isFinite(value)?null:Math.round(value*10)/10;
const safeExercises=new Map([
  ['bench press','Bench press'],['bench press (barbell)','Barbell bench press'],
  ['bench press (dumbbell)','Dumbbell bench press'],['squat (barbell)','Barbell squat'],
  ['deadlift (barbell)','Barbell deadlift'],['overhead press (barbell)','Barbell overhead press'],
]);

type Observations={today:string;workouts:Workout[];templates:Template[];weights:Measurement[];
  entries:Entry[];completed:string[];target:Target|null;goals:Goal[];capped:boolean};

export function coachingContext(data:Observations,topic?:Topic){
  const today=z.iso.date().parse(data.today);
  const through=shiftDay(today,-1);
  const start=shiftDay(today,-30);
  const prior=shiftDay(today,-60);
  const workouts=data.workouts.filter(workout=>{
    const day=dayKey(workout.started_at);
    return day>=prior&&day<today;
  }).slice(0,180);
  const templates=new Map(data.templates.map(template=>[template.id,template]));
  const weights=data.weights.filter(row=>row.kind==='weight'&&row.day<today&&row.value>0);
  const summary=(from:string,to:string)=>{
    const sessions=workouts.filter(workout=>dayKey(workout.started_at)>=from&&dayKey(workout.started_at)<=to);
    const metrics=sessions.map(workout=>workoutMetrics(workout,templates));
    const known=metrics.flatMap(row=>row.volume==null?[]:[row.volume]);
    return {from,to,sessions:sessions.length,trainingDays:new Set(sessions.map(row=>dayKey(row.started_at))).size,
      workingSets:metrics.reduce((sum,row)=>sum+row.sets,0),mappedSessions:known.length,
      mappedVolumeKg:known.length?round(known.reduce((sum,value)=>sum+value,0)):null};
  };
  const completed=new Set(data.completed);
  const calories=diaryCalories(data.entries,completed,today).trend;
  const records=bestRecords(workouts,templates);
  const report=dailyIntelligence({workouts,templates,measurements:weights,records,nutrition:calories,today,days:30});
  const daily=new Map<string,Entry[]>();
  for(const entry of data.entries){
    if(entry.day<start||entry.day>through||!completed.has(entry.day)) continue;
    const portions=daily.get(entry.day)??[];
    portions.push(entry);
    daily.set(entry.day,portions);
  }
  const nutrients=['kcal','protein','carbs','fat'] as const;
  const nutrition=Object.fromEntries(nutrients.map(key=>{
    const days=[...daily.values()].map(rows=>rows.map(row=>portionValues(row.portion)[key]))
      .filter(values=>values.every(value=>typeof value==='number'&&Number.isFinite(value)));
    const total=days.flat().reduce<number>((sum,value)=>sum+(value??0),0);
    return [key,{sample:days.length,mean:days.length?round(total/days.length):null}];
  }));
  const exercises=new Map<string,{name:string;day:string;estimated1RMkg:number}>();
  for(const workout of workouts){
    const day=dayKey(workout.started_at);
    for(const exercise of workout.workout_exercises){
      const template=templates.get(exercise.template_id);
      const name=safeExercises.get((template?.title??'').trim().toLowerCase());
      if(!name||!loaded(template)||(topic==='bench'&&!name.toLowerCase().includes('bench'))) continue;
      const peak=Math.max(0,...exercise.workout_sets.filter(working).map(set=>estimate(set.weight_kg??0,set.reps??0)??0));
      const key=JSON.stringify([name,day]);
      if(peak>(exercises.get(key)?.estimated1RMkg??0)) exercises.set(key,{name,day,estimated1RMkg:round(peak)!});
    }
  }
  const evidence={
    through,
    windows:[summary(shiftDay(today,-7),through),summary(start,through),summary(prior,shiftDay(start,-1))],
    historyMayBeCapped:data.capped,
    dailyIntelligence:report.indicators.slice(0,3).map(({label,value})=>({label,value})),
    recentSessions:workouts.slice(0,6).map(row=>({day:dayKey(row.started_at),workingSets:workoutMetrics(row,templates).sets})),
    muscleDistribution30d:Object.entries(muscleTotals(workouts.filter(row=>dayKey(row.started_at)>=start),templates))
      .map(([muscle,{direct,secondary}])=>({muscle,direct,secondary})),
    exerciseEstimates:[...exercises.values()].sort((a,b)=>b.day.localeCompare(a.day)).slice(0,topic==='bench'?22:12),
    bestImprovementsIn60DayWindow:records.filter(record=>record.previous!==null&&['Max weight','Estimated 1RM'].includes(record.metric)).slice(0,5)
      .map(row=>({exercise:safeExercises.get(row.title.trim().toLowerCase())??'Other exercise',metric:row.metric,
        day:dayKey(row.at),kg:round(row.value),previousKg:round(row.previous)})),
    nutrition30d:nutrition,
    target:data.target?{day:data.target.day,kcal:data.target.kcal,protein:data.target.protein,carbs:data.target.carbs,fat:data.target.fat}:null,
    weight:{numberOfMeasurements:weights.length,latest7DayMeanKg:round(movingAverage(weights,through,7)),
      previous7DayMeanKg:round(movingAverage(weights,shiftDay(through,-7),7))},
    activeGoals:data.goals.filter(row=>row.status==='active'&&['workouts','weekly_workouts','weight'].includes(row.kind)).slice(0,5)
      .map(({kind,target,deadline})=>({kind,target,deadline})),
    adaptiveNutrition:adaptiveMaintenance(today,data.entries,data.completed,weights),
  };
  const {nutrition30d,target,weight,activeGoals,adaptiveNutrition,...training}=evidence;
  const payload=topic==='nutrition'?{through,historyMayBeCapped:data.capped,nutrition30d,target,weight,adaptiveNutrition}:
    topic==='bench'||topic==='strength'||topic==='week'||topic==='next'?training:
    { ...training,nutrition30d,target,weight,activeGoals,adaptiveNutrition };
  return JSON.stringify({...(topic?{question:topics[topic]}:{}),evidence:payload});
}
