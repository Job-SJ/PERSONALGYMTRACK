import {z} from 'zod';
import {dayKey, estimate, loaded, muscleTotals, relativeStrength, shiftDay, sum, weekKey, working, workoutMetrics, zone} from './analytics';
import {discoverPartners, partnerKey, type PartnerWorkout} from './coach-partners';
import type {Measurement, Template, Workout} from './model';

export const analyticalQuery=z.object({
  tool:z.enum(['training','strength','muscles','partners','nutrition','bodyweight','goals','workouts','notes']),
  from:z.iso.date().nullable(),
  through:z.iso.date(),
  compare:z.boolean().default(false),
}).strict().refine(query=>query.from===null||query.from<=query.through);
export type AnalyticalQuery=z.infer<typeof analyticalQuery>;
type Tool=AnalyticalQuery['tool'];

const intents:[Tool,RegExp][]=[
  ['partners',/\b(partners?|trainingspartner\w*|with whom|met wie|samen|wie.*train\w*|(?:train\w*|workouts?) (?:with|met))\b/i],
  ['nutrition',/calori|nutrition|voeding|protein|eiwit|diary|dagboek|macros?|maintenance|onderhoud/i],
  ['bodyweight',/body\s?weight|lichaamsgewicht|weight trend|my weight|mijn gewicht|weigh|gewichtstrend/i],
  ['goals',/\bgoals?\b|doel|focus|what should|waar.*op letten/i],
  ['strength',/strength|stronger|lifts?|weakest|personal record|\bprs?\b|bench|squat|deadlift|press|curl|sterker|kracht|records?|sterkste|zwakste|perform better|exercise history|oefengeschiedenis/i],
  ['muscles',/muscl|spier/i],
  ['notes',/\bnotes?\b|notities|beschrijvingen/i],
  ['workouts',/\b(?:list|show)\b.*\b(?:workouts?|sessions?)\b|toon.*trainingen/i],
  ['training',/duration|how long|volume|frequency|consisten|habit|weekdays?|which days|training|workouts?|sessions?|duur|hoe lang|patron|gewoont/i],
];
const matches=(prompt:string)=>intents.filter(([,pattern])=>pattern.test(prompt)).map(([tool])=>tool);
const followUpPattern=/^(?:and|what about|how about|en|hoe zit|how many|how often|hoeveel|hoe vaak)\b|\b(?:that|those|same|daarmee|diezelfde)\b/i;
export const needsCoachRouting=(prompt:string,previous:string)=>!matches(prompt).length&&
  !(followUpPattern.test(prompt)&&matches(previous).length);
export const selectableTools=['training','strength','muscles','nutrition','bodyweight','goals','workouts','notes'] as const;
const dates=(prompt:string)=>prompt.match(/\b\d{4}-\d{2}-\d{2}\b/g)?.filter(day=>z.iso.date().safeParse(day).success)??[];
const numberWords:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  een:1,twee:2,drie:3,vier:4,vijf:5,zes:6,zeven:7,acht:8,negen:9,tien:10};
const amountPattern=new RegExp(`\\b(\\d{1,3}|${Object.keys(numberWords).join('|')}) (days?|dagen|weeks?|weken|months?|maanden|years?|jaar)\\b`,'i');
const calendarMonth=(day:string,offset:number)=>new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7))-1+offset,1)).toISOString().slice(0,10);
function calendarOffset(day:string,months:number){
  const first=calendarMonth(day,months);
  const last=shiftDay(calendarMonth(first,1),-1);
  return shiftDay(first,Math.min(Number(day.slice(-2)),Number(last.slice(-2)))-1);
}

export function planCoachAnalysis(prompt:string,previous:string,today:string,routed?:Tool[]):AnalyticalQuery[]{
  const tools=routed?.length?[...routed]:matches(prompt);
  const followUp=followUpPattern.test(prompt);
  if(followUp&&!tools.includes('partners')&&!tools.includes('strength')){
    const earlier=matches(previous);
    if(earlier.length) tools.unshift(...earlier);
  }
  const period=/\b(?:this month|last month|deze maand|afgelopen maand|all (?:time|history)|since I started|sinds (?:het begin|ik)|alle trainingen|last year|afgelopen jaar)\b/i;
  const timeText=period.test(prompt)||amountPattern.test(prompt)||dates(prompt).length?prompt:followUp?previous:'';
  const [first,last]=dates(timeText);
  const amount=timeText.match(amountPattern);
  const amountValue=amount?(numberWords[amount[1].toLowerCase()]??Number(amount[1])):0;
  const todayMonth=calendarMonth(today,0);
  const month=/this month|deze maand/i.test(timeText);
  const previousMonth=/last month|afgelopen maand/i.test(timeText)&&!month;
  const all=/all (?:time|history)|since I started|sinds (?:het begin|ik)|alle trainingen/i.test(timeText);
  const days=amount?amountValue*(/week|weken/i.test(amount[2])?7:/month|maanden/i.test(amount[2])?30:/year|jaar/i.test(amount[2])?365:1):
    /last year|afgelopen jaar/i.test(timeText)?365:30;
  const end=tools.includes('partners')?today:shiftDay(today,-1);
  const through=last&&last<=end?last:previousMonth?shiftDay(todayMonth,-1):end;
  const compare=/compar|versus|vergelij|changed|verander|increasing|toenem|differ|verschil/i.test(prompt);
  const selected=[...new Set(tools)].slice(0,3);
  if(selected.includes('partners')) selected.splice(1);
  return selected.flatMap(tool=>{
    const fallback=tool==='strength'?90:30;
    const calendarMonths=amount&&/month|maand|year|jaar/i.test(amount[2])?
      Math.max(1,amountValue)*(/year|jaar/i.test(amount[2])?12:1):0;
    const boundary=shiftDay(through,1);
    const start=first??(month?todayMonth:previousMonth?calendarMonth(today,-1):calendarMonths?
      calendarOffset(boundary,-calendarMonths):shiftDay(boundary,-Math.max(1,period.test(timeText)||amount?days:fallback)));
    const from=all||(tool==='partners'&&!period.test(timeText)&&!amount&&!first)?null:start;
    const primary=analyticalQuery.safeParse({tool,from,through,compare});
    if(!primary.success) return [];
    if(!compare||!from||!['training','muscles','strength','nutrition','bodyweight'].includes(tool)) return [primary.data];
    const length=Math.round((Date.parse(through)-Date.parse(from))/86400000)+1;
    const older=month&&/three months|3 months|drie maanden|3 maanden/i.test(prompt)?calendarMonth(from,-3):shiftDay(from,-length);
    return [primary.data,{tool,from:older,through:shiftDay(from,-1),compare:false}];
  }).slice(0,4);
}

const average=(values:number[])=>values.length?round(sum(values)/values.length):null;
const round=(value:number)=>Math.round(value*10)/10;
const trainingClock=new Intl.DateTimeFormat('en',{timeZone:zone,weekday:'short',hour:'2-digit',hourCycle:'h23'});
export function trainingEvidence(workouts:Workout[],templates:Map<string,Template>,query:AnalyticalQuery,capped:boolean,firstTrackedDay?:string){
  const dateKeys=workouts.map(row=>dayKey(row.started_at)).sort();
  const first=firstTrackedDay??dateKeys[0];
  const start=first&&query.from&&query.from>first?query.from:first;
  const weeks=!capped&&start&&start<=query.through?(Date.parse(query.through)-Date.parse(start)+86400000)/604800000:null;
  const rows=workouts.map(workout=>workoutMetrics(workout,templates));
  const volumes=rows.flatMap(row=>row.volume===null?[]:[row.volume]);
  const isoWeeks=new Set(dateKeys.map(weekKey));
  const days:Record<string,number>={};
  const hours:Record<string,number>={};
  for(const workout of workouts){
    const parts=trainingClock.formatToParts(new Date(workout.started_at));
    const weekday=parts.find(part=>part.type==='weekday')!.value;
    const hour=parts.find(part=>part.type==='hour')!.value;
    days[weekday]=(days[weekday]??0)+1;
    hours[hour]=(hours[hour]??0)+1;
  }
  const reps:Record<string,number>={};
  const exerciseFrequency=new Map<string,Set<string>>();
  for(const workout of workouts) for(const exercise of workout.workout_exercises) for(const set of exercise.workout_sets){
    if(!working(set)||!set.reps) continue;
    const sessions=exerciseFrequency.get(exercise.template_id)??new Set<string>();
    sessions.add(workout.id);
    exerciseFrequency.set(exercise.template_id,sessions);
    const band=set.reps<=5?'1–5':set.reps<=8?'6–8':set.reps<=12?'9–12':set.reps<=15?'13–15':'16+';
    reps[band]=(reps[band]??0)+1;
  }
  const muscles=query.tool==='muscles'?Object.fromEntries(Object.entries(muscleTotals(workouts,templates)).map(([key,value])=>
    [key,{directSets:value.direct,secondarySets:value.secondary,sessions:value.sessions,directSetsPerWeek:weeks?round(value.direct/weeks):null}])):undefined;
  const midpoint=start?shiftDay(start,Math.floor(((Date.parse(query.through)-Date.parse(start))/86400000+1)/2)):null;
  const split=midpoint&&midpoint>start&&query.compare&&!capped?{
    before:midpoint,earlyWorkouts:dateKeys.filter(day=>day<midpoint).length,lateWorkouts:dateKeys.filter(day=>day>=midpoint).length,
  }:undefined;
  return {workouts:rows.length,firstRecordedDay:dateKeys[0]??null,observedFrom:start??null,
    calendarWeeks:weeks?round(weeks):null,activeCalendarWeeks:isoWeeks.size,
    workoutsPerWeek:weeks?round(rows.length/weeks):null,meanDurationMinutes:average(rows.filter(row=>row.minutes>0).map(row=>row.minutes)),
    timedWorkouts:rows.filter(row=>row.minutes>0).length,meanWorkingSets:average(rows.map(row=>row.sets)),
    workoutsWithRoutine:workouts.filter(row=>row.routine_id).length,
    workoutsWithSuperset:workouts.filter(row=>row.workout_exercises.some(exercise=>exercise.superset_id!=null)).length,
    mappedVolumeKg:volumes.length?round(sum(volumes)):null,mappedVolumeKgPerWeek:weeks&&volumes.length?round(sum(volumes)/weeks):null,
    workoutsWithMappedVolume:volumes.length,reps,days,hours,timezone:zone,muscles,split,
    exercises:[...exerciseFrequency].sort((a,b)=>b[1].size-a[1].size).slice(0,6)
      .map(([id,sessions],index)=>({exercise:liftLabel(templates.get(id)?.title??'',index+1),sessions:sessions.size}))};
}

const liftPattern=/\b(bench press|squat|deadlift|overhead press|shoulder press|leg press|lat pulldown|barbell row|dumbbell row|biceps curl|bench)\b/i;
function liftLabel(title:string,index:number){
  const lift=title.match(liftPattern)?.[0].toLowerCase()??'other lift';
  const equipment=title.match(/\b(barbell|dumbbell|machine|cable|smith)\b/i)?.[0].toLowerCase();
  return `${lift}${equipment?` (${equipment})`:''} ${index}`;
}
export function strengthEvidence(workouts:Workout[],templates:Map<string,Template>,current:string,weights:Measurement[]=[],previous=''){
  const prior=followUpPattern.test(current)?previous:'';
  const focus=[current,prior].map(text=>text.match(liftPattern)?.[1].toLowerCase().replace(/^bench$/,'bench press')).find(Boolean);
  const phrase=(value:string)=>' '+value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
  const currentPhrase=phrase(current);
  const priorPhrase=phrase(prior);
  const exact=[...templates.values()].filter(template=>template.title.trim().length>=4&&currentPhrase.includes(phrase(template.title)));
  const inherited=prior&&!liftPattern.test(current)?
    [...templates.values()].filter(template=>template.title.trim().length>=4&&priorPhrase.includes(phrase(template.title))):[];
  const focused=exact.length?exact:inherited;
  const selected=new Set(focused.map(template=>template.id));
  const groups=new Map<string,Map<string,{day:string;kg:number;minutes:number;maxWeight:number;relative:number|null}>>();
  for(const workout of workouts) for(const exercise of workout.workout_exercises){
    const template=templates.get(exercise.template_id);
    if(!loaded(template)||(selected.size?!selected.has(exercise.template_id):focus&&!template?.title.toLowerCase().includes(focus))) continue;
    const sets=exercise.workout_sets.filter(working);
    const kg=Math.max(0,...sets.map(set=>estimate(set.weight_kg??0,set.reps??0)??0));
    if(!kg) continue;
    const sessions=groups.get(exercise.template_id)??new Map();
    const existing=sessions.get(workout.id);
    const maxWeight=Math.max(existing?.maxWeight??0,...sets.map(set=>set.weight_kg??0));
    if(kg>(existing?.kg??0)) sessions.set(workout.id,{day:dayKey(workout.started_at),kg,
      minutes:(Date.parse(workout.ended_at)-Date.parse(workout.started_at))/60000,maxWeight,
      relative:weights.length?relativeStrength(kg,workout.started_at,weights):null});
    else if(existing) existing.maxWeight=maxWeight;
    groups.set(exercise.template_id,sessions);
  }
  const results=[...groups].map(([id,sessions],index)=>{
    const title=templates.get(id)!.title;
    const rows=[...sessions.values()].sort((a,b)=>a.day.localeCompare(b.day));
    const sample=Math.min(3,Math.floor(rows.length/2));
    const first=sample?sum(rows.slice(0,sample).map(row=>row.kg))/sample:null;
    const last=sample?sum(rows.slice(-sample).map(row=>row.kg))/sample:null;
    const timed=rows.filter(row=>row.minutes>0).sort((a,b)=>a.minutes-b.minutes);
    const middle=Math.floor(timed.length/2);
    const relative=rows.flatMap(row=>row.relative===null?[]:[row.relative]);
    const split=middle>=2&&timed[middle-1].minutes<timed[middle].minutes?{
      shorter:{sessions:middle,meanEstimated1RMKg:average(timed.slice(0,middle).map(row=>row.kg))},
      longer:{sessions:timed.length-middle,meanEstimated1RMKg:average(timed.slice(middle).map(row=>row.kg))},
    }:null;
    return {exercise:liftLabel(title,index+1),sessions:rows.length,firstDay:rows[0].day,lastDay:rows.at(-1)!.day,
      earlyMeanEstimated1RMKg:first===null?null:round(first),recentMeanEstimated1RMKg:last===null?null:round(last),sessionsPerMean:sample,
      changePercent:first&&last!==null?round((last-first)/first*100):null,
      bestEstimated1RMKg:round(Math.max(...rows.map(row=>row.kg))),maxLoggedWeightKg:Math.max(...rows.map(row=>row.maxWeight)),
      durationAssociation:split,relativeStrength:relative.length?{samples:relative.length,meanEstimated1RMToBodyweight:
        Math.round(sum(relative)/relative.length*100)/100}:undefined};
  });
  const comparable=results.filter(row=>row.changePercent!==null);
  const byChange=[...comparable].sort((a,b)=>b.changePercent!-a.changePercent!);
  return {focus:selected.size?'requested exercise selection':focus??null,comparableExercises:comparable.length,improvedExercises:comparable.filter(row=>row.changePercent!>0).length,
    declinedExercises:comparable.filter(row=>row.changePercent!<0).length,exerciseCount:results.length,
    exercises:[...new Set([...byChange.slice(0,2),...byChange.slice(-2),...results.sort((a,b)=>b.sessions-a.sessions)])].slice(0,8)};
}

export function partnerReply(workouts:PartnerWorkout[],query:AnalyticalQuery,prompt:string,previous:string,capped:boolean){
  const {partners,aliases,duration}=discoverPartners(workouts,query.through);
  const dutch=/\b(wie|hoe|wanneer|met wie|vaak|trainde|trainingspartner|vergelijk|samen|mijn)\b/i.test(prompt);
  const words=new Set([...prompt.matchAll(/@?[\p{L}’'-]+/gu)].map(match=>partnerKey(match[0])));
  const nameQuery=(value:string)=>value.match(/\b(?:with|met)\s+(@?[\p{L}’'-]+)/iu)?.[1]??
    value.match(/^(?:what about|and|en)\s+(@?[\p{Lu}][\p{L}’'-]+)\s*\?*$/u)?.[1];
  const requested=nameQuery(prompt)??(/^(?:and|en|what about|hoe zit)/i.test(prompt)?nameQuery(previous):undefined);
  const named=requested?partnerKey(requested):undefined;
  const matched=partners.find(row=>words.has(row.key)||row.key===named||[...aliases].some(([alias,keys])=>
    keys.size===1&&keys.has(row.key)&&(words.has(alias)||alias===named)));
  const unknownNamed=named&&!matched&&!/^(?:a|someone|somebody|people|iemand|een|wie|me|them|hen|others|other|whom|most|often|usually|recently|last|this|more|in|on|het|meestal|vaak|laatst|samen)$/i.test(named);
  const dateWindow=query.from?`${query.from} – ${query.through}`:query.through;
  const source=dutch?`Bekeken: ${workouts.length} trainingen · ${dateWindow}`:`Reviewed ${workouts.length} workouts · ${dateWindow}`;
  const scope=capped?(dutch?' De scan bereikte de limiet. Oudere trainingen kunnen ontbreken.':' The scan reached its limit. Older workouts may be missing.'):'';
  const latestQuestion=/\bwho\b.*\blast\b|\bmet wie\b.*\blaatst\b/i.test(prompt);
  const selected=matched??(latestQuestion?[...partners].sort((a,b)=>b.last.localeCompare(a.last))[0]:partners[0]);
  if(!selected||unknownNamed) return {
    text:(dutch?'Ik vond geen expliciete vermelding van deze trainingspartner in de bekeken trainingen.':'I found no explicit reference to this training partner in the workouts I reviewed.')+
      (dutch?' Titels, beschrijvingen en oefennotities tellen mee als ze vermelden dat je samen hebt getraind.':' Titles, descriptions and exercise notes count when they explicitly say you trained together.')+scope,
    evidence:{label:source,dates:[]},
  };
  const tied=!matched&&!latestQuestion&&partners.filter(row=>row.count===selected.count).slice(0,5);
  const label=tied&&tied.length>1?tied.map(row=>row.name).join(', '):selected.name;
  const confidence=selected.count>=3?(dutch?'sterke herhaalde aanwijzingen':'strong repeated evidence'):(dutch?'beperkte aanwijzingen':'limited evidence');
  const text=dutch?
    `**${label}** — ${selected.count} trainingen met een expliciete vermelding${tied&&tied.length>1?' per persoon (gedeelde eerste plaats)':''}. ${selected.name}: laatst op ${selected.last}, ${selected.recent} in de 30 dagen tot ${query.through} (${confidence}).`:
    `**${label}** — ${selected.count} workouts with explicit references${tied&&tied.length>1?' per person (tied for most)':''}. For ${selected.name}: last on ${selected.last}, with ${selected.recent} in the 30 days through ${query.through} (${confidence}).`;
  const {explicit,unlabelled}=duration;
  const comparison=query.compare&&explicit.count&&unlabelled.count?
    (dutch?`\n\nTrainingen met een partnervermelding duurden gemiddeld ${explicit.mean} min (n=${explicit.count}) en trainingen zonder vermelding ${unlabelled.mean} min (n=${unlabelled.count}). Een ontbrekende vermelding zegt niets over wie er bij was.`:
      `\n\nWorkouts with an explicit partner reference averaged ${explicit.mean} minutes (n=${explicit.count}), versus ${unlabelled.mean} minutes without one (n=${unlabelled.count}). Unlabelled workouts may include partners.`):'';
  return {text:text+comparison+scope,evidence:{label:source,dates:[...new Set((tied&&tied.length?tied:[selected]).flatMap(row=>row.dates))].sort().reverse().slice(0,12)}};
}
