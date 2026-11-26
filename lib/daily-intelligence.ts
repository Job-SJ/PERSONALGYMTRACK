import {bestRecords,dayKey,estimate,loaded,matchedBodyweight,muscles,muscleTotals,shiftDay,sum,volume,working} from './analytics';
import {formatNumber,formatPercent,type Locale} from './format';
import type {Measurement,Template,Workout} from './model';

export const intelligencePeriods=[7,30,90] as const;
export type IntelligencePeriod=typeof intelligencePeriods[number];
export const intelligenceWindows={
  7:{minSpan:2,recentDays:3,bucketDays:1},
  30:{minSpan:7,recentDays:10,bucketDays:5},
  90:{minSpan:14,recentDays:21,bucketDays:10},
} satisfies Record<IntelligencePeriod,{minSpan:number;recentDays:number;bucketDays:number}>;
export function intelligencePeriod(value?:string):IntelligencePeriod {
  return intelligencePeriods.find(period=>String(period)===value)??30;
}

type Point={day:string;value:number};
type Direction='up'|'down'|'steady'|'mixed';
type Change={before:number;after:number;percent:number;direction:Direction;points:Point[];sample:number;span:number};
type Exercise={id:string;name:string;points:Point[]};
type Comparison={before:Point[];after:Point[]};
type Insight={key:string;title:string;detail:string;href:string;priority:number;confidence:number;day:string;pattern?:string};
type Indicator={label:string;value:string;detail:string;points:number[];tone?:'positive'};
export type DailyReport={headline:string;summary:string;indicators:Indicator[];insights:Insight[];through:string};

const median=(values:number[])=>{
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const daySpan=(points:Point[])=>(Date.parse(points.at(-1)!.day)-Date.parse(points[0].day))/86_400_000;
const changePercent=(after:number,before:number)=>(after/before-1)*100;

function trend({before,after}:Comparison,days:IntelligencePeriod,threshold=3):Change|null {
  if(before.length<3||after.length<3) return null;
  // A few same-week repeats cannot establish a month-long change.
  const {minSpan}=intelligenceWindows[days];
  if(daySpan(before)<minSpan||daySpan(after)<minSpan) return null;
  const baseline=median(before.map(point=>point.value));
  if(baseline<=0) return null;
  const recent=median(after.map(point=>point.value));
  const percent=changePercent(recent,baseline);
  const differences=after.map(point=>changePercent(point.value,baseline));
  const support=threshold*2/3;
  const supports=(check:(value:number)=>boolean)=>differences.filter(check).length>=Math.ceil(after.length*2/3)
    && differences.slice(-2).every(check);
  const direction=percent>=threshold&&supports(value=>value>=support)?'up':
    percent<=-threshold&&supports(value=>value<=-support)?'down':
    Math.abs(percent)<=support&&supports(value=>Math.abs(value)<=support*2)?'steady':'mixed';
  return {before:baseline,after:recent,percent,direction,points:after,sample:Math.min(before.length,after.length),
    span:(Date.parse(after.at(-1)!.day)-Date.parse(before[0].day))/86_400_000};
}

export function dailyIntelligence({workouts,templates,measurements,records,nutrition=[],today,days,locale='en-GB'}:{
  workouts:Workout[];templates:Map<string,Template>;measurements:Measurement[];
  records:ReturnType<typeof bestRecords>;nutrition?:Point[];today:string;days:IntelligencePeriod;locale?:Locale;
}):DailyReport {
  const start=shiftDay(today,-days), previous=shiftDay(start,-days), through=shiftDay(today,-1);
  const beforeWorkouts:Workout[]=[], afterWorkouts:Workout[]=[];
  const beforeDays=new Set<string>(), afterDays=new Set<string>();
  const dailyVolume=new Map<string,number>(), byExercise=new Map<string,{name:string;points:Map<string,number>}>();
  const coverage={before:0,after:0};
  let historyAtStart=false;
  let loggedWorkout=false;
  for(const workout of workouts){
    const day=dayKey(workout.started_at);
    if(day>today) continue;
    loggedWorkout=true;
    if(day<=previous) historyAtStart=true;
    if(day<previous||day>=today) continue;
    const period=day<start?'before':'after';
    (period==='before'?beforeWorkouts:afterWorkouts).push(workout);
    (period==='before'?beforeDays:afterDays).add(day);
    let total=0;
    for(const exercise of workout.workout_exercises){
      const template=templates.get(exercise.template_id);
      if(!loaded(template)) continue;
      let highest=0;
      for(const set of exercise.workout_sets){
        if(!working(set)) continue;
        const load=volume(set,template);
        if(load!=null&&Number.isFinite(load)&&load>0) total+=load;
        highest=Math.max(highest,estimate(set.weight_kg??0,set.reps??0)??0);
      }
      if(!highest) continue;
      const entry=byExercise.get(exercise.template_id)??{name:template?.title||exercise.title,points:new Map()};
      entry.points.set(day,Math.max(entry.points.get(day)??0,highest));
      byExercise.set(exercise.template_id,entry);
    }
    if(total>0){
      dailyVolume.set(day,(dailyVolume.get(day)??0)+total);
      coverage[period]++;
    }
  }
  const split=(points:Point[]):Comparison=>{
    const ordered=points.filter(point=>point.day>=previous&&point.day<today).sort((a,b)=>a.day.localeCompare(b.day));
    return {before:ordered.filter(point=>point.day<start),after:ordered.filter(point=>point.day>=start)};
  };
  const recentCutoff=shiftDay(today,-intelligenceWindows[days].recentDays);
  const compare=(periods:Comparison,threshold=3)=>{
    const latest=periods.after.at(-1);
    return latest&&latest.day>=recentCutoff?trend(periods,days,threshold):null;
  };
  const exercises:Exercise[]=[...byExercise].map(([id,{name,points}])=>({id,name,points:[...points].map(([day,value])=>({day,value}))}));
  const strength=exercises.flatMap(exercise=>{
    const comparison=compare(split(exercise.points));
    return comparison?[{...exercise,comparison}]:[];
  });
  const directionCounts={up:0,down:0,steady:0,mixed:0};
  for(const {comparison} of strength) directionCounts[comparison.direction]++;
  const strengthDirection=strength.length?(['up','down','steady'] as const)
    .find(direction=>directionCounts[direction]>=Math.ceil(strength.length*2/3)):undefined;
  const relevantStrength=strength.filter(item=>item.comparison.direction===strengthDirection)
    .sort((a,b)=>b.comparison.sample-a.comparison.sample||b.comparison.points.at(-1)!.day.localeCompare(a.comparison.points.at(-1)!.day)||a.id.localeCompare(b.id));
  const leader=relevantStrength[0];
  const strengthChange=strength.length?median(strength.map(item=>item.comparison.percent)):null;

  const bucketSize=intelligenceWindows[days].bucketDays;
  const bucket=(values:Map<string,number>)=>{
    const bins=Array<number>(days/bucketSize).fill(0);
    for(let i=0;i<days;i++) bins[Math.floor(i/bucketSize)]+=values.get(shiftDay(start,i))??0;
    return bins;
  };
  let priorVolume=0, recentVolume=0;
  for(const [day,load] of dailyVolume){
    if(day<start) priorVolume+=load;
    else recentVolume+=load;
  }
  const comparableVolume=coverage.before>=2&&coverage.after>=2
    &&coverage.before/beforeWorkouts.length>=0.75&&coverage.after/afterWorkouts.length>=0.75;
  const volumePercent=comparableVolume?changePercent(recentVolume,priorVolume):null;
  const consistency=historyAtStart&&beforeDays.size>=3;
  const dayDifference=afterDays.size-beforeDays.size;
  const meaningfulAttendance=consistency&&Math.abs(dayDifference)>=Math.max(2,Math.ceil(beforeDays.size*0.2));
  const decimal=(value:number)=>formatNumber(value,1,locale);
  const percent=(value:number)=>new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1,signDisplay:'exceptZero'}).format(value/100);
  const exerciseLink=(id:string)=>'/app/exercises/'+encodeURIComponent(id)+'?days='+days;
  const indicators:Indicator[]=[
    {label:'Strength progression',value:strengthChange==null?'—':!leader?'Mixed':percent(strengthChange),
      detail:!strength.length?'More comparable sessions needed':strength.length===1?strength[0].name+' · estimated 1RM':strength.length+' comparable exercises · estimated 1RM',
      points:strength.length===1?strength[0].comparison.points.map(point=>point.value):[],tone:strengthDirection==='up'&&leader?'positive':undefined},
    {label:'Training volume',value:volumePercent==null?'—':percent(volumePercent),detail:volumePercent==null?'More mapped loaded sessions needed':'Recorded working-set volume',
      points:volumePercent==null?[]:bucket(dailyVolume)},
    {label:'Training consistency',value:afterDays.size+' / '+days+' days',detail:consistency?'Prior period: '+beforeDays.size+' training days':'Prior baseline unavailable',
      points:afterDays.size?bucket(new Map([...afterDays].map(day=>[day,1]))):[],tone:meaningfulAttendance&&dayDifference>0?'positive':undefined},
  ];

  let headline='Build your training baseline.';
  let summary=loggedWorkout?'More recorded sessions will make changes easier to distinguish from normal variation.':'Import workouts to see how your strength, volume and training rhythm change over time.';
  let headlineInsight='';
  if(leader&&strengthDirection){
    const scope=strength.length===1?leader.name:relevantStrength.length+' of '+strength.length+' comparable exercises';
    headline=strengthDirection==='up'?'Estimated strength is rising.':strengthDirection==='down'?'Estimated strength has dipped.':'Your estimated strength is holding steady.';
    summary=strengthDirection==='steady'
      ? scope+' stayed within a narrow range across comparable sessions.'
      : scope+' '+(strengthDirection==='up'?'improved':'declined')+' across repeated sessions in the last '+days+' completed days.';
  }else if(meaningfulAttendance){
    headline=dayDifference>0?'You’re training more often.':'You’ve recorded fewer training days.';
    summary='You trained on '+afterDays.size+' days versus '+beforeDays.size+' in the preceding '+days+' days.';
    headlineInsight='attendance';
  }else if(strength.length){
    headline='Your recent strength estimates are mixed.';
    summary='The recorded estimates vary across sessions or exercises. A sustained overall direction is still unclear.';
  }else if(consistency){
    headline='Your training rhythm is holding steady.';
    summary='You recorded '+afterDays.size+' training days versus '+beforeDays.size+' in the preceding '+days+' days.';
  }

  const candidates:Insight[]=[];
  for(const {id,name,comparison} of strength){
    const {direction,sample,span,points,before,after,percent:delta}=comparison;
    const last=points.at(-1)!.day;
    if(direction==='up'||direction==='down'){
      candidates.push({key:'exercise:'+id,title:name+(direction==='up'?' is trending up.':' has a lower recent estimate.'),
        detail:'Median estimated 1RM: '+decimal(after)+' kg vs '+decimal(before)+' kg ('+percent(delta)+').',
        href:exerciseLink(id),priority:5,confidence:Math.min(sample,8)/4,day:last,pattern:'lift-'+direction});
    }else if(direction==='steady'&&span>=21){
      candidates.push({key:'exercise:'+id,title:name+' has levelled out.',
        detail:'Estimated 1RM medians differed by at most 2% across periods spanning '+span+' days.',
        href:exerciseLink(id),priority:3,confidence:Math.min(sample,8)/4,day:last,pattern:'plateau'});
    }
  }

  const strengthById=new Map(strength.map(exercise=>[exercise.id,exercise.comparison.direction]));
  const recordExercises=new Set<string>();
  for(const record of records){
    if(record.metric!=='Estimated 1RM'||record.previous==null||record.value<record.previous*1.02) continue;
    const day=dayKey(record.at);
    if(day<start||day>today) continue;
    const id=record.key.slice(0,record.key.lastIndexOf('|'));
    if(strengthById.get(id)!=='up'||recordExercises.has(id)) continue;
    recordExercises.add(id);
    candidates.push({key:'exercise:'+id,title:'A new estimated best on '+record.title+'.',
      detail:decimal(record.value)+' kg estimated 1RM, up from '+decimal(record.previous)+' kg.',
      href:'/app/workouts/'+encodeURIComponent(record.workout)+(record.setPosition==null?'#exercise-'+record.exercisePosition:'#set-'+record.exercisePosition+'-'+record.setPosition),
      priority:6,confidence:1,day,pattern:'record'});
  }

  if(meaningfulAttendance){
    candidates.push({key:'attendance',title:dayDifference>0?'You trained on more days.':'You trained on fewer days.',
      detail:afterDays.size+' training days versus '+beforeDays.size+' in the preceding period.',
      href:'/app/calendar',priority:4,confidence:Math.min(beforeDays.size,8)/4,day:[...afterDays].sort().at(-1)??through});
  }

  if(volumePercent!=null&&Math.abs(volumePercent)>=20){
    const mid=shiftDay(start,Math.floor(days/2));
    const firstTotal=sum([...dailyVolume].flatMap(([day,value])=>day>=start&&day<mid?[value]:[]));
    const secondTotal=recentVolume-firstTotal;
    const direction=Math.sign(volumePercent);
    const sustained=changePercent(firstTotal/Math.floor(days/2),priorVolume/days)*direction>=10
      &&changePercent(secondTotal/Math.ceil(days/2),priorVolume/days)*direction>=10;
    if(sustained) candidates.push({key:'volume',title:direction>0?'Your recorded workload increased.':'Your recorded workload decreased.',
      detail:percent(volumePercent)+' in mapped working-set volume. Both halves of the period moved in the same direction.',
      href:'/app/analytics?days='+days,priority:4,confidence:Math.min(coverage.before,coverage.after,8)/4,day:through});
  }

  if(beforeDays.size>=3&&afterDays.size>=3){
    const prior=muscleTotals(beforeWorkouts,templates), recent=muscleTotals(afterWorkouts,templates);
    const priorTotal=sum(Object.values(prior).map(row=>row.direct)), recentTotal=sum(Object.values(recent).map(row=>row.direct));
    if(priorTotal>=20&&recentTotal>=20){
      const shifts=Object.entries(muscles).flatMap(([id,label])=>{
        const before=prior[id].direct/priorTotal, after=recent[id].direct/recentTotal;
        return Math.max(prior[id].direct,recent[id].direct)>=8&&prior[id].sessions>=2&&recent[id].sessions>=2
          ?[{id,label,before,after,change:Math.abs(after-before)}]:[];
      }).sort((a,b)=>b.change-a.change);
      const largest=shifts[0];
      if(largest&&largest.change>=0.12) candidates.push({key:'muscle',title:largest.label+' took '+(largest.after>largest.before?'a larger':'a smaller')+' share of training.',
        detail:'Its share of mapped direct sets shifted from '+Math.round(largest.before*100)+'% to '+Math.round(largest.after*100)+'%.',
        href:'/app/muscles/'+largest.id+'?days='+days,priority:4,confidence:1,day:through});
    }
  }

  const weighIns=new Map<string,number[]>();
  const earliestWeight=shiftDay(previous,-7);
  for(const row of measurements){
    if(row.kind!=='weight'||row.day<earliestWeight||row.day>=today||!Number.isFinite(row.value)||row.value<=0) continue;
    const sameDay=weighIns.get(row.day)??[];
    sameDay.push(row.value);
    weighIns.set(row.day,sameDay);
  }
  const weightPoints=[...weighIns].map(([day,values])=>({day,value:median(values)}));
  const weightChange=compare(split(weightPoints),1);
  if(weightChange&&(weightChange.direction==='up'||weightChange.direction==='down')){
    candidates.push({key:'weight',title:'Your recorded bodyweight is trending '+weightChange.direction+'.',
      detail:'Median weigh-in: '+decimal(weightChange.after)+' kg vs '+decimal(weightChange.before)+' kg.',
      href:'/app/body',priority:3,confidence:Math.min(weightChange.sample,8)/4,day:weightChange.points.at(-1)!.day});
  }
  if(weighIns.size){
    const byDay=new Map<string,number|null>();
    const validMeasurements=weightPoints.map(point=>({...point,kind:'weight',source:'daily median',id:point.day}));
    for(const {id,name,points} of exercises){
      const relative=points.flatMap(point=>{
        if(!byDay.has(point.day)) byDay.set(point.day,matchedBodyweight(point.day,validMeasurements)?.value??null);
        const weight=byDay.get(point.day);
        return weight?[{...point,value:point.value/weight}]:[];
      });
      const change=compare(split(relative));
      if(!change||(change.direction!=='up'&&change.direction!=='down')) continue;
      const absolute=strengthById.get(id);
      if(absolute&&absolute!==change.direction&&absolute!=='steady') continue;
      candidates.push({key:'exercise:'+id,title:name+' changed relative to bodyweight.',
        detail:'Median estimated 1RM per kg bodyweight '+(change.direction==='up'?'rose ':'fell ')+formatPercent(Math.abs(change.percent)/100,locale)+'.',
        href:exerciseLink(id),priority:3,confidence:Math.min(change.sample,8)/4,day:change.points.at(-1)!.day,pattern:'relative'});
    }
  }

  const diary=split(nutrition.filter(point=>Number.isFinite(point.value)&&point.value>0));
  const minimumDiaryDays=Math.max(4,Math.ceil(days*0.4));
  if(diary.before.length>=minimumDiaryDays&&diary.after.length>=minimumDiaryDays){
    const change=compare(diary,10);
    if(change&&(change.direction==='up'||change.direction==='down')){
      candidates.push({key:'nutrition',title:'Logged intake is trending '+change.direction+'.',
        detail:'Median on completed diary days: '+formatNumber(change.after,0,locale)+' vs '+formatNumber(change.before,0,locale)+' kcal.',
        href:'/app/nutrition',priority:3,confidence:Math.min(change.sample,8)/4,day:change.points.at(-1)!.day});
    }
  }

  const score=(item:Insight)=>item.priority+item.confidence+(item.day>=shiftDay(today,-7)?1:0);
  const seen=new Set([headlineInsight]);
  const patterns=new Set<string>();
  const insights:Insight[]=[];
  for(const item of candidates.sort((a,b)=>score(b)-score(a)||b.day.localeCompare(a.day)||a.key.localeCompare(b.key))){
    if(seen.has(item.key)||(item.pattern&&patterns.has(item.pattern))) continue;
    insights.push(item);
    seen.add(item.key);
    if(item.pattern) patterns.add(item.pattern);
    if(insights.length===3) break;
  }
  return {headline,summary,indicators,insights,through};
}
