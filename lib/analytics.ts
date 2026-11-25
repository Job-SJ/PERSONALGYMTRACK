import type {SetEntry,Template,Workout,Measurement} from './model';

export const zone = 'Europe/Amsterdam';
export const muscles = {
  chest:'Chest', back:'Back', biceps:'Biceps', triceps:'Triceps', shoulders:'Shoulders',
  forearms:'Forearms', quadriceps:'Quadriceps', hamstrings:'Hamstrings', glutes:'Glutes',
  calves:'Calves', core:'Core',
} as const;
const aliases: Record<string,string> = {
  abdominals:'core', lats:'back', traps:'back', upper_back:'back', lower_back:'back', forearm:'forearms',
};
export const muscleKey = (key?:string|null) => key ? aliases[key] ?? key : '';
const dayFormat = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
export const dayKey = (date:string|Date) => dayFormat.format(new Date(date));
export const shiftDay = (day:string, amount:number) => new Date(Date.parse(day)+amount*86400000).toISOString().slice(0,10);
export const weekKey = (day:string) => shiftDay(day,-((new Date(day).getUTCDay()+6)%7));
export const sum = (values:number[]) => values.reduce((a,b)=>a+b,0);
export function estimate(weight:number, reps:number, formula:'epley'|'brzycki'='epley') {
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  if (reps === 1) return weight;
  return formula === 'epley' ? weight*(1+reps/30) : weight*36/(37-reps);
}
export const working = (s:SetEntry) => s.type !== 'warmup';
export const loaded = (t?:Template) => t?.type === 'weight_reps';
export function volume(s:SetEntry,t?:Template) {
  return working(s) && loaded(t) && s.weight_kg != null && s.weight_kg > 0 && s.reps != null ? s.weight_kg*s.reps : null;
}
export function workoutMetrics(w:Workout, templates:Map<string,Template>) {
  const sets = w.workout_exercises.flatMap(e=>e.workout_sets.filter(working).map(s=>({s,t:templates.get(e.template_id)})));
  const values = sets.flatMap(({s,t})=>volume(s,t) ?? []);
  return {sets:sets.length,reps:sum(sets.map(({s})=>s.reps ?? 0)),volume:values.length ? sum(values) : null,
    minutes:(Date.parse(w.ended_at)-Date.parse(w.started_at))/60000};
}
export function muscleTotals(workouts:Workout[], templates:Map<string,Template>) {
  const totals:Record<string,{direct:number;secondary:number;sessions:number;last:string|null}> = {};
  for (const key of Object.keys(muscles)) totals[key]={direct:0,secondary:0,sessions:0,last:null};
  for (const w of workouts) {
    const seen = new Set<string>();
    for (const e of w.workout_exercises) {
      const template=templates.get(e.template_id);
      const primary=muscleKey(template?.primary_muscle);
      const count=e.workout_sets.filter(working).length;
      if (!count) continue;
      for (const key of new Set([primary,...(template?.secondary_muscles ?? []).map(muscleKey)])) {
        if (!Object.hasOwn(totals,key)) continue;
        const row=totals[key];
        if (key===primary) row.direct+=count;
        else row.secondary+=count;
        if (!seen.has(key)) row.sessions++;
        seen.add(key);
        if (!row.last || w.started_at>row.last) row.last=w.started_at;
      }
    }
  }
  return totals;
}
export function streaks(workouts:Workout[], today:string) {
  const days=[...new Set(workouts.map(w=>dayKey(w.started_at)))].filter(d=>d<=today).sort();
  let longest=0, run=0, previous='';
  for (const d of days) {
    run=previous===shiftDay(d,-1)?run+1:1;
    longest=Math.max(longest,run);
    previous=d;
  }
  return {longest,current:previous===today || previous===shiftDay(today,-1) ? run : 0};
}
export function bestRecords(workouts:Workout[], templates:Map<string,Template>) {
  const records: {key:string; title:string; metric:string; value:number; workout:string; at:string}[]=[];
  const best = new Map<string,number>();
  for (const w of [...workouts].sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at)||a.id.localeCompare(b.id))) {
    const session = new Map<string,{title:string;metric:string;value:number}>();
    for (const e of w.workout_exercises) {
      const template=templates.get(e.template_id);
      const add=(metric:string,value:number|null|undefined) => {
        if (value==null || value<=0) return;
        const key=e.template_id+'|'+metric;
        if (value>(session.get(key)?.value ?? 0)) session.set(key,{title:e.title,metric,value});
      };
      const volumes:number[]=[];
      for (const s of e.workout_sets.filter(working)) {
        const load=volume(s,template);
        if (load!=null) volumes.push(load);
        if (loaded(template)) {
          add('Max weight',s.weight_kg);
          if (s.reps && s.weight_kg!=null) add(s.reps+'-rep weight',s.weight_kg);
          add('Estimated 1RM',estimate(s.weight_kg ?? 0,s.reps ?? 0));
        }
        if (template?.type==='bodyweight_reps' && !s.weight_kg) add('Bodyweight reps',s.reps);
      }
      if (volumes.length) add('Exercise volume',sum(volumes));
    }
    for (const [key,r] of session) if (r.value>(best.get(key) ?? 0)) {
      best.set(key,r.value);
      records.push({key,...r,workout:w.id,at:w.started_at});
    }
  }
  return records.reverse();
}
export function movingAverage(rows:Measurement[], day:string, window:number) {
  const values=rows.filter(r=>r.kind==='weight' && r.day<=day && r.day>=shiftDay(day,1-window)).map(r=>r.value);
  return values.length ? sum(values)/values.length : null;
}
export function relativeStrength(weight:number, at:string, rows:Measurement[]) {
  const day=dayKey(at);
  const measurement=rows.filter(r=>r.kind==='weight' && r.day<=day && r.day>=shiftDay(day,-7) && r.value>0)
    .sort((a,b)=>b.day.localeCompare(a.day))[0];
  return measurement && weight>0 ? weight/measurement.value : null;
}

export function trainingFrequencyComparison(workouts:Workout[], today:string) {
  const currentStart=shiftDay(today,-28), priorStart=shiftDay(today,-56);
  const currentEnd=shiftDay(today,-1), priorEnd=shiftDay(currentStart,-1);
  const dates=workouts.map(w=>dayKey(w.started_at)).filter(d=>d<today);
  if(!dates.some(d=>d<=priorStart)) return null;
  const count=(start:string,end:string)=>dates.filter(d=>d>=start&&d<=end).length;
  const current=count(currentStart,currentEnd), previous=count(priorStart,priorEnd);
  return {current,previous,currentStart,currentEnd,priorStart,priorEnd};
}
