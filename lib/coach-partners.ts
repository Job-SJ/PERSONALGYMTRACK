import {dayKey, shiftDay} from './analytics';

export type PartnerWorkout = {
  id:string; title:string; notes?:string|null; started_at:string; ended_at:string;
  workout_exercises:{notes?:string|null}[];
};

const name = "[\\p{L}][\\p{L}’'-]{1,29}";
// Require a completed activity or an explicit partner label. A bare name,
// a spotter, or a plan to train together is insufficient evidence.
const mention = new RegExp(
  `(?:^|[.!?;\\n]\\s*)(?:i\\s+|ik\\s+)?(?:trained with|worked out with|lifted with|getraind met|trainde met|training partner\\s*:|trainingspartner\\s*:|(?:push|pull|legs|upper|lower|full body|workout|training)\\s+(?:with|met))\\s*(@?${name})(?:\\s*\\(aka\\s+(@?${name})\\))?(?=\\s*(?:$|[.!?;,\\n]|\\b(?:today|yesterday|vandaag|gisteren|and|en)\\b))`,
  'giu',
);
const excluded = new Set('coach trainer partner friend friends nobody iemand niemand barbell dumbbell dumbbells belt straps bands weights pain machines music ease iedereen resistance intensity confidence fatigue caution equipment focus'.split(' '));
export const partnerKey = (value:string) => value.normalize('NFKC').toLowerCase().replace(/^@/,'').replace(/’/g,"'");

export function discoverPartners(workouts:PartnerWorkout[],today:string){
  const aliases=new Map<string,Set<string>>();
  const recognizable=new Set<string>();
  const occurrences=workouts.map(workout=>{
    const names=new Map<string,string>();
    for(const field of [workout.title,workout.notes,...workout.workout_exercises.map(exercise=>exercise.notes)]){
      for(const match of (field??'').slice(0,4000).matchAll(mention)){
        const key=partnerKey(match[1]);
        if(excluded.has(key)) continue;
        if(/^@|\p{Lu}/u.test(match[1])) recognizable.add(key);
        names.set(key,match[1].replace(/^@/,''));
        if(!match[2]) continue;
        const alias=partnerKey(match[2]);
        if(excluded.has(alias)||alias===key) continue;
        recognizable.add(key);
        recognizable.add(alias);
        const candidates=aliases.get(alias)??new Set<string>();
        candidates.add(key);
        aliases.set(alias,candidates);
      }
    }
    return {workout,names};
  });
  const partners=new Map<string,{name:string; days:string[]; workouts:Set<string>}>();
  const referenced=new Set<string>();
  const names=new Map<string,string>();
  for(const {names:found} of occurrences) for(const [key,label] of found) names.set(key,label);
  for(const {workout,names:found} of occurrences){
    for(const key of found.keys()){
      if(!recognizable.has(key)) continue;
      const candidates=aliases.get(key);
      const candidate=candidates?.size===1?[...candidates][0]:key;
      const canonical=aliases.has(candidate)?key:candidate;
      const partner=partners.get(canonical)??{name:names.get(canonical)??canonical,days:[],workouts:new Set<string>()};
      if(partner.workouts.has(workout.id)) continue;
      partner.workouts.add(workout.id);
      referenced.add(workout.id);
      partner.days.push(dayKey(workout.started_at));
      partners.set(canonical,partner);
    }
  }
  const durations=(explicit:boolean)=>{
    const minutes=workouts.filter(workout=>referenced.has(workout.id)===explicit)
      .map(workout=>(Date.parse(workout.ended_at)-Date.parse(workout.started_at))/60000)
      .filter(minutes=>minutes>0);
    return {count:minutes.length,mean:minutes.length?Math.round(minutes.reduce((sum,value)=>sum+value,0)/minutes.length):null};
  };
  return {aliases,partners:[...partners.entries()].map(([key,row])=>{
    const dates=row.days.sort().reverse();
    return {key,name:row.name,count:row.workouts.size,dates:dates.slice(0,12),last:dates[0],
      recent:dates.filter(day=>day>=shiftDay(today,-29)&&day<=today).length};
  }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)),
  duration:{explicit:durations(true),unlabelled:durations(false)}};
}
