import {diaryCalories,shiftDay,type Entry} from './nutrition';

type Observation={day:string;value:number};
const mean=(rows:Observation[])=>rows.reduce((total,row)=>total+row.value,0)/rows.length;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export function adaptiveMaintenance(today:string,entries:Entry[],completed:string[],weights:Observation[]){
  const weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7;
  const end=shiftDay(today,-weekday);
  const start=shiftDay(end,-28);
  const inWindow=({day}:Observation)=>day>=start&&day<end;
  const intake=diaryCalories(entries.filter(({day})=>day>=start&&day<end),new Set(completed),end).trend.filter(row=>row.value>0);
  const measurements=[...new Map(weights.filter(row=>inWindow(row)&&Number.isFinite(row.value)&&row.value>0).map(row=>[row.day,row])).values()];
  const baseline=measurements.filter(row=>row.day<shiftDay(start,7));
  const recent=measurements.filter(row=>row.day>=shiftDay(end,-7));
  const coverage=[0,7,14,21].map(offset=>intake.filter(row=>row.day>=shiftDay(start,offset)&&row.day<shiftDay(start,offset+7)).length);
  const sufficient=intake.length>=21&&coverage.every(count=>count>=4)&&baseline.length>=3&&recent.length>=3;
  const evidence={start,end:shiftDay(end,-1),days:intake.length,baselineDays:baseline.length,recentDays:recent.length};
  if(!sufficient) return {...evidence,estimate:null};
  const intakeMean=mean(intake);
  const weightChange=mean(recent)-mean(baseline);
  const distanceDays=mean(recent.map(row=>({...row,value:Date.parse(row.day)/86400000})))-
    mean(baseline.map(row=>({...row,value:Date.parse(row.day)/86400000})));
  // A rough energy equivalent for weight change, with reduced influence for water and logging noise.
  const correction=clamp(-weightChange*7700/distanceDays*0.5,-250,250);
  const kcal=Math.round((intakeMean+correction)/50)*50;
  return {...evidence,estimate:{kcal,intakeMean,weightChange,correction}};
}

export function adaptiveTarget(maintenance:number,offset:number,current?:number){
  if(maintenance<1600||maintenance>5000) return null;
  const goal=Math.max(1600,Math.round((maintenance+offset)/50)*50);
  if(!current) return goal;
  if(current<1600||current>5000) return null;
  return clamp(goal,current-150,current+150);
}
