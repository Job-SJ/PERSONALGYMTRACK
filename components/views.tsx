import {Suspense} from 'react';
import {DailyIntelligence,IntelligenceLoading} from './daily-intelligence';
import {AthleteNav} from './athlete-nav';
import type {IntelligencePeriod} from '../lib/daily-intelligence';
import type {diaryCalories} from '../lib/nutrition';
import {MetricChart} from './metric-chart';
import {TrainingCalendar} from './training-calendar';
import Link from 'next/link';
import {Activity,CalendarDays,Dumbbell,Plug,Target,Weight} from 'lucide-react';
import {bestRecords,dayKey,estimate,loaded,matchedBodyweight,movingAverage,muscles,muscleSessions,muscleTotals,relativeStrength,shiftDay,streaks,sum,volume,weekKey,working,workoutMetrics} from '../lib/analytics';
import {formatNumber,formatDate,formatUnit,type Locale} from '../lib/format';
import type {Goal,Measurement,Template,Workout} from '../lib/model';
import {Anatomy} from './anatomy';
import {Trend} from './charts';
import {RepMaxCalculator} from './calculator';
import {MfaEnrollment} from './mfa-enrollment';
import {HevySyncForm} from './hevy-sync-form';
import {goal,importCsv,logout,measurement,preferences,setPassword} from '../app/actions';

const number=formatNumber;
const short=formatDate;
const measurementLabels={weight:'Bodyweight',body_fat:'Body fat',muscle_mass:'Muscle mass',waist:'Waist',arm:'Arm',chest:'Chest',thigh:'Thigh',calf:'Calf'};
const measureUnit=(kind:string)=>kind==='body_fat'?'%':kind==='weight'||kind==='muscle_mass'?'kg':'cm';
type Data={workouts:Workout[];templates:Map<string,Template>;measurements:Measurement[];locale?:Locale};
const ranges=[[7,'7D'],[30,'30D'],[90,'90D'],[183,'6M'],[365,'1Y'],[0,'All']] as const;
export function rangeValue(value?:string){return ranges.some(([n])=>String(n)===value)?Number(value):90;}
const inRange=(workouts:Workout[],days:number)=>{
  const today=dayKey(new Date());
  return workouts.filter(w=>dayKey(w.started_at)<=today&&(!days||dayKey(w.started_at)>=shiftDay(today,1-days)));
};
function Range({days,base}:{days:number;base:string}){
  return <nav className="range" aria-label="Date range">{ranges.map(([n,label])=><Link aria-current={days===n?'true':undefined} href={base+(base.includes('?')?'&':'?')+'days='+n} key={n}>{label}</Link>)}</nav>;
}
export function Heading({section,title,description,children}:{section:string;title:string;description:string;children?:React.ReactNode}){
  return <div className="heading"><div><p className="eyebrow">{section}</p><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
function Empty({children}:{children:React.ReactNode}){return <div className="empty">{children}</div>;}
function Card({title,subtitle,action,children}:{title:string;subtitle?:string;action?:React.ReactNode;children:React.ReactNode}){
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function Disclosure({title,children}:{title:string;children:React.ReactNode}){
  return <details className="panel disclosure"><summary>{title}</summary>{children}</details>;
}
function Stats({items}:{items:{label:string;value:string|number;note?:string;icon?:typeof Activity}[]}){
  return <div className="stats">{items.map(({label,value,note,icon:Icon})=><section className="stat" key={label}><div><span>{label}</span>{Icon&&<Icon size={16}/>}</div><strong>{value}</strong>{note&&<small>{note}</small>}</section>)}</div>;
}
function ActivityCalendar({workouts}:{workouts:Workout[]}){
  const count=new Map<string,number>();
  for(const w of workouts){const key=dayKey(w.started_at);count.set(key,(count.get(key)??0)+1);}
  const today=dayKey(new Date()), start=shiftDay(weekKey(today),-7*25);
  return <><div className="calendar-scroll"><div className="heat-grid">{Array.from({length:182},(_,i)=>{const day=shiftDay(start,i);const n=count.get(day)??0;return <span key={day} className={'heat-cell heat-'+Math.min(n,3)} title={day+' · '+n+' workouts'}/>;})}</div></div><p className="legend">Last 26 weeks <span>Fewer <i/><i/><i/> More</span></p><details className="chart-data"><summary>View active dates</summary>{count.size?<ul>{[...count].sort().reverse().slice(0,182).map(([d,n])=><li key={d}>{d} · {n}</li>)}</ul>:<p>No workout dates.</p>}</details></>;
}
function TrainingPerformanceChart({workouts,templates,measurements,days,locale='en-GB'}:Data&{days:number}) {
  const today=dayKey(new Date());
  const currentWeek=weekKey(today);
  const rangeStart=days?shiftDay(today,1-days):null;
  const weeks=new Map<string,ReturnType<typeof workoutMetrics>[]>();
  for(const workout of workouts) {
    const key=weekKey(dayKey(workout.started_at));
    const rows=weeks.get(key)??[];
    rows.push(workoutMetrics(workout,templates));
    weeks.set(key,rows);
  }
  const metrics=[
    {key:'volume',label:'Volume load',unit:'kg × reps',get:(rows:ReturnType<typeof workoutMetrics>[])=>{
      const values=rows.flatMap(row=>row.volume??[]);
      return values.length?sum(values):null;
    }},
    {key:'sets',label:'Working sets',unit:'sets',get:(rows:ReturnType<typeof workoutMetrics>[])=>sum(rows.map(row=>row.sets))},
    {key:'frequency',label:'Training frequency',unit:'workouts',get:(rows:ReturnType<typeof workoutMetrics>[])=>rows.length},
    {key:'reps',label:'Repetitions',unit:'reps',get:(rows:ReturnType<typeof workoutMetrics>[])=>sum(rows.map(row=>row.reps))},
    {key:'time',label:'Duration',unit:'h',get:(rows:ReturnType<typeof workoutMetrics>[])=>sum(rows.map(row=>row.minutes))/60},
  ];
  const series=metrics.map(({get,...metric})=>({...metric,points:[...weeks].sort(([a],[b])=>a.localeCompare(b)).flatMap(([day,rows])=>{
    const value=get(rows);
    return value==null?[]:[{label:short(day,locale),at:day,value,incomplete:day===currentWeek||Boolean(rangeStart&&day<rangeStart)}];
  })}));
  const weights=measurements.filter(r=>r.kind==='weight'&&r.day<=today&&(!rangeStart||r.day>=rangeStart)).sort((a,b)=>a.day.localeCompare(b.day));
  return <MetricChart locale={locale} series={[...series,{key:'weight',label:'Bodyweight',unit:'kg',detailScale:true,points:weights.map(r=>({label:short(r.day,locale),at:r.day,value:r.value}))}]}/>;
}
export function Dashboard({workouts,templates,measurements,days,intelligence,syncAt,locale='en-GB',preview=false,nutrition,diary,
  updatedAt=new Date().toISOString(),today=dayKey(updatedAt)}:Data&{
    days:number;intelligence:IntelligencePeriod;syncAt:string|null;preview?:boolean;nutrition?:React.ReactNode;
    diary?:Promise<ReturnType<typeof diaryCalories>|null>;updatedAt?:string;today?:string;
  }){
  const current=inRange(workouts,days), totals=muscleTotals(current,templates);
  const records=bestRecords(workouts.filter(workout=>dayKey(workout.started_at)<=today),templates);
  const base=(preview?'/?tab=dashboard':'/app')+(preview?'&':'?')+'intelligence='+intelligence;
  return <>
  <Suspense fallback={<IntelligenceLoading/>}>
    <DailyIntelligence input={{workouts,templates,measurements,records,today,days:intelligence,locale}}
      diary={diary} chartDays={days} preview={preview} updatedAt={updatedAt}/>
  </Suspense>
  {preview&&<div className="setup"><span className="setup-icon"><Plug size={19}/></span><div><strong>Connect your training data</strong><p>Configure Supabase to import workouts and unlock your personal analytics.</p></div><Link href="/?tab=integrations" className="button">Integration setup</Link></div>}

  <div className="split dashboard-primary">
    <Card title="Training performance" subtitle="Weekly training totals and dated weigh-ins" action={<Range days={days} base={base}/>}>
      <TrainingPerformanceChart workouts={current} templates={templates} measurements={measurements} days={days} locale={locale}/>
    </Card>
    <div className="dashboard-side">
      <Card title="Muscle distribution" subtitle="Direct working sets by region" action={<Target size={17}/>}><Anatomy totals={totals} preview={preview} days={days} locale={locale}/><div className="legend">Direct sets <span>0 <i/><i/><i/> {Math.max(...Object.values(totals).map(t=>t.direct))||'?'}</span></div></Card>
      {nutrition}
      <Card title="Latest personal records" action={<Link href={preview?'/?tab=records':'/app/records'} className="quiet">All records</Link>}><RecordRows locale={locale} records={records.slice(0,3)}/></Card>
    </div>
  </div>
  <div className="split lower">
    <Card title="Training activity" subtitle="Workouts recorded each day" action={<Link className="quiet" href={preview?'/?tab=calendar':'/app/calendar'}><CalendarDays size={16}/>Open training calendar</Link>}>
      <ActivityCalendar workouts={workouts}/>
    </Card>
    <Card title="Recent workouts" subtitle={syncAt?'Last Hevy sync ? '+short(syncAt,locale):undefined}>
      <WorkoutRows workouts={current.slice(0,5)} templates={templates} locale={locale}/>
    </Card>
  </div></>;
}
const workoutHref=(id:string)=>'/app/workouts/'+encodeURIComponent(id);
function WorkoutRows({workouts,templates,locale='en-GB'}:{workouts:Workout[];templates:Map<string,Template>;locale?:Locale}){
  if(!workouts.length) return <Empty>No workouts in this view.</Empty>;
  return <div className="rows workout-list">{workouts.map(workout=>{
    const metrics=workoutMetrics(workout,templates);
    return <Link className="row" key={workout.id} href={workoutHref(workout.id)} prefetch={false}>
      <span><strong>{workout.title}</strong><small>{short(workout.started_at,locale)} ? {number(metrics.minutes,0,locale)} min ? {metrics.sets} working sets</small></span>
      <span>{formatUnit(metrics.volume,'kg ? reps',1,locale)}</span>
    </Link>;
  })}</div>;
}
function RecordRows({records,locale='en-GB'}:{records:ReturnType<typeof bestRecords>;locale?:Locale}){
  return records.length?<div className="detail record-table"><table><thead><tr><th>Exercise</th><th>Record</th><th>Value</th><th>Workout</th></tr></thead><tbody>
    {records.map(r=><tr key={r.key+r.workout}><td>{r.title}</td><td>{r.metric}</td><td>{formatUnit(r.value,r.metric==='Bodyweight reps'?'reps':r.metric==='Exercise volume'?'kg × reps':'kg',2,locale)}</td>
    <td><Link href={workoutHref(r.workout)+(r.setPosition==null?'#exercise-'+r.exercisePosition:'#set-'+r.exercisePosition+'-'+r.setPosition)}>{short(r.at,locale,{dateStyle:'medium'})}</Link></td></tr>)}
  </tbody></table></div>:<Empty>No comparable records are available yet.</Empty>;

}
function RecordMatrix({records,locale}:{records:ReturnType<typeof bestRecords>;locale:Locale}) {
  const best=new Map<number,(typeof records)[number]>();
  for(const record of records) {
    const match=/^(\d+)-rep weight$/.exec(record.metric);
    if (match&&!best.has(Number(match[1]))) best.set(Number(match[1]),record);
  }
  return best.size?<div className="detail"><table><thead><tr><th>Reps</th><th>Best load</th><th>Previous</th><th>Gain</th><th>Achieved</th></tr></thead><tbody>{[...best].sort(([a],[b])=>a-b).map(([reps,record])=><tr key={reps}>
    <td>{number(reps,0,locale)}</td><td>{formatUnit(record.value,'kg',2,locale)}</td><td>{formatUnit(record.previous,'kg',2,locale)}</td><td>{formatUnit(record.previous==null?null:record.value-record.previous,'kg',2,locale)}</td><td><Link href={workoutHref(record.workout)+'#set-'+record.exercisePosition+'-'+record.setPosition}>{short(record.at,locale,{dateStyle:'medium'})}</Link></td>
  </tr>)}</tbody></table></div>:<Empty>No recorded rep-specific load records.</Empty>;
}
export function TrainingView({data,tab,slug,days,q,formula,preview=false}:{data:Data;tab:string;slug?:string;days:number;q?:string;formula?:string;preview?:boolean}){
  const {workouts,templates,locale='en-GB'}=data;
  const current=inRange(workouts,days);
  const base=preview?'/?tab='+tab+(slug&&tab==='muscles'?'&muscle='+encodeURIComponent(slug):''):'/app/'+tab+(slug?'/'+encodeURIComponent(slug):'');
  const filter=<Range days={days} base={formula==='brzycki'?base+(base.includes('?')?'&':'?')+'formula=brzycki':base}/>;
  const list=new Map(workouts.flatMap(w=>w.workout_exercises.map(e=>[e.template_id,e.title] as const)));
  const rangeLabel='Selected period · Europe/Amsterdam';
  if(tab==='workouts'&&slug) {
    const session=workouts.find(w=>w.id===slug);
    if(!session) return <><Heading section="TRAINING" title="Workout unavailable" description="This workout is unavailable in your history."/><Link href="/app/workouts">Workout history</Link></>;
    const metrics=workoutMetrics(session,templates);
    const direct=muscleTotals([session],templates);
    return <><Heading section="WORKOUT REPLAY" title={session.title} description={short(session.started_at,locale,{dateStyle:'long'})}><Link className="quiet" href="/app/workouts">Workout history</Link></Heading>
      <Stats items={[{label:'Training time',value:formatUnit(metrics.minutes,'min',0,locale)},{label:'Working sets',value:number(metrics.sets,0,locale)},{label:'Repetitions',value:number(metrics.reps,0,locale)},{label:'Volume load',value:formatUnit(metrics.volume,'kg × reps',1,locale)}]}/>
      <div className="split"><Card title="Exercise order">{session.notes&&<p>{session.notes}</p>}<div className="replay">{[...session.workout_exercises].sort((a,b)=>a.position-b.position).map(e=><section key={e.position} id={'exercise-'+e.position}><h3><Link href={'/app/exercises/'+encodeURIComponent(e.template_id)}>{e.title}</Link></h3>{e.notes&&<p className="muted">{e.notes}</p>}<table><thead><tr><th>Set</th><th>Load</th><th>Reps</th><th>Other</th><th>RPE</th></tr></thead><tbody>{[...e.workout_sets].sort((a,b)=>a.position-b.position).map(set=><tr id={`set-${e.position}-${set.position}`} key={set.position}><td>{set.position+1} / {set.type}</td><td>{formatUnit(set.weight_kg,'kg',2,locale)}</td><td>{number(set.reps,0,locale)}</td><td>{set.duration_seconds!=null?formatUnit(set.duration_seconds,'s',1,locale):formatUnit(set.distance_meters,'m',1,locale)}</td><td>{number(set.rpe,1,locale)}</td></tr>)}</tbody></table></section>)}</div></Card>
      <div><Card title="Muscle distribution"><Anatomy totals={direct}/></Card><Card title="Records established"><RecordRows records={bestRecords(workouts,templates).filter(r=>r.workout===session.id)} locale={locale}/></Card></div></div></>;
  }
  if(tab==='workouts') {
    const query=q?.trim().toLowerCase();
    const shown=query?current.filter(w=>w.title.toLowerCase().includes(query)||w.workout_exercises.some(e=>e.title.toLowerCase().includes(query))):current;
    return <><Heading section="TRAINING" title="Workout history" description={rangeLabel}>{filter}</Heading><Card title="Sessions" subtitle={shown.length+' workouts'}><form className="inline"><input type="hidden" name={preview?'tab':'days'} value={preview?'workouts':days}/><input name="q" defaultValue={q} aria-label="Search workouts" placeholder="Search workouts or exercises"/><button className="button secondary">Search</button></form><WorkoutRows workouts={shown} templates={templates} locale={locale}/></Card></>;
  }
  if(tab==='calendar') {
    const sessions=workouts.map(w=>{
      const {sets,minutes}=workoutMetrics(w,templates);
      const direct=muscleTotals([w],templates);
      return {id:w.id,title:w.title,day:dayKey(w.started_at),sets,minutes,
        muscles:Object.entries(muscles).flatMap(([key,label])=>direct[key].direct?[label]:[])};
    });
    return <><Heading section="TRAINING" title="Training calendar" description="Sessions by local date in Europe/Amsterdam."/><Card title="Activity calendar"><TrainingCalendar sessions={sessions} today={dayKey(new Date())} locale={locale}/></Card></>;
  }
  if(tab==='records') return <><Heading section="TRAINING" title="Personal records" description="Session-best performances that exceeded an earlier value or established a baseline.">{filter}</Heading><Card title="Record history"><RecordRows locale={locale} records={bestRecords(workouts,templates).filter(r=>current.some(w=>w.id===r.workout))}/></Card></>;
  if(tab==='exercises'&&slug) {
    const name=list.get(slug);
    if(!name) return <><Heading section="EXERCISES" title="Exercise unavailable" description="This exercise has no recorded workout history."/><Link href="/app/exercises">Exercise library</Link></>;
    const t=templates.get(slug);
    const sessions=current.filter(w=>w.workout_exercises.some(e=>e.template_id===slug));
    const sets=sessions.flatMap(w=>w.workout_exercises.filter(e=>e.template_id===slug).flatMap(e=>e.workout_sets.filter(working)));
    const method=formula==='brzycki'?'brzycki':'epley';
    const exerciseRecords=bestRecords(workouts,templates).filter(r=>r.key.startsWith(slug+'|'));
    const recordSessions=new Set(exerciseRecords.filter(r=>r.metric==='Estimated 1RM').map(r=>r.workout));
    const sessionRows=[...sessions].reverse().map(w=>{
      const work=w.workout_exercises.filter(e=>e.template_id===slug).flatMap(e=>e.workout_sets.filter(working));
      const loadedSets=loaded(t)?work.filter(set=>set.weight_kg!=null&&set.weight_kg>0):[];
      const estimates=loadedSets.flatMap(set=>estimate(set.weight_kg!,set.reps??0,method)??[]);
      const volumes=loadedSets.flatMap(set=>volume(set,t)??[]);
      const reps=work.flatMap(set=>set.reps??[]);
      return {point:{label:short(w.started_at,locale),at:w.started_at,href:workoutHref(w.id)},workout:w.id,
        estimate:estimates.length?Math.max(...estimates):null,
        load:loadedSets.length?Math.max(...loadedSets.map(set=>set.weight_kg!)):null,
        sets:work.length,volume:volumes.length?sum(volumes):null,reps:reps.length?sum(reps):null};
    });
    const estimates=sessionRows.flatMap(row=>row.estimate==null?[]:[{...row.point,value:row.estimate,record:method==='epley'&&recordSessions.has(row.workout)}]);
    const exerciseSeries=[
      {key:'estimate',label:'Estimated 1RM',unit:'kg',detailScale:true,points:estimates},
      ...([{key:'load',label:'Maximum recorded load',unit:'kg',detailScale:true},{key:'sets',label:'Working sets',unit:'sets'},{key:'volume',label:'Volume load',unit:'kg × reps'},{key:'reps',label:'Repetitions',unit:'reps'}] as const).map(metric=>({
        ...metric,points:sessionRows.flatMap(row=>row[metric.key]==null?[]:[{...row.point,value:row[metric.key]!}]),
      })),
      {key:'relative',label:'Relative strength',unit:'times bodyweight',detailScale:true,points:estimates.flatMap(point=>{
        const value=relativeStrength(point.value,point.at,data.measurements);
        return value==null?[]:[{...point,value,record:false}];
      })},
    ];
    const loads=sets.flatMap(s=>loaded(t)&&s.weight_kg!=null&&s.weight_kg>0?s.weight_kg:[]);
    const volumes=sets.flatMap(s=>volume(s,t)??[]);
    const latest=estimates.at(-1);
    const matchedWeight=latest?matchedBodyweight(latest.at,data.measurements):null;
    const ratio=latest?relativeStrength(latest.value,latest.at,data.measurements):null;
    return <><Heading section="EXERCISE ANALYTICS" title={name} description={rangeLabel}>{filter}</Heading>
    <Stats items={[{label:'Sessions',value:sessions.length},{label:'Max load',value:loads.length?number(Math.max(...loads),2,locale)+' kg':'—'},{label:'Recorded volume',value:volumes.length?formatUnit(sum(volumes),'kg × reps',1,locale):'—'},{label:'Latest relative strength',value:ratio==null?'—':number(ratio,2,locale)+'×',note:matchedWeight?'Matched '+formatUnit(matchedWeight.value,'kg',2,locale)+' on '+short(matchedWeight.day,locale):latest?'No bodyweight recorded on or within 7 days before '+short(latest.at,locale):'No eligible estimated 1RM in this period'}]}/>
    <Card title="Session progression" subtitle="External loads with 1–10 reps. Estimates depend on effort and technique." action={<Link className="button secondary" href={base+'?days='+days+'&formula='+(method==='epley'?'brzycki':'epley')}>{method==='epley'?'Use Brzycki':'Use Epley'}</Link>}><MetricChart series={exerciseSeries} locale={locale}/><RepMaxCalculator/></Card>
    <Card title="Exercise records"><RecordMatrix records={exerciseRecords} locale={locale}/></Card><Disclosure title="Workout history"><WorkoutRows workouts={sessions} templates={templates} locale={locale}/></Disclosure></>;
  }
  if(tab==='exercises') return <><Heading section="TRAINING" title="Exercise library" description="Exercises recorded in your workout history."/><Card title="Recorded exercises">{list.size?<div className="rows">{[...list].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,label])=><Link key={id} className="row" href={'/app/exercises/'+encodeURIComponent(id)}>{label}<Dumbbell size={15}/></Link>)}</div>:<Empty>Import workouts to populate the exercise library.</Empty>}</Card></>;
  if(tab==='muscles'){
    const totals=muscleTotals(current,templates), name=slug&&Object.hasOwn(muscles,slug)?muscles[slug as keyof typeof muscles]:undefined;
    if(!name||!slug) return <><Heading section="MUSCLE ANALYTICS" title="Full body overview" description="Working sets by primary and secondary exercise mapping.">{filter}</Heading>
      <div className="split"><Card title="Anatomical map"><Anatomy totals={totals} preview={preview} days={days} locale={locale}/></Card><Card title="Muscle groups"><div className="rows">{Object.entries(muscles).map(([key,label])=><Link className="row" key={key} href={(preview?'/?tab=muscles&muscle='+key+'&days=':'/app/muscles/'+key+'?days=')+days}>{label}<span>{totals[key].direct} direct · {totals[key].secondary} secondary</span></Link>)}</div></Card></div></>;
    const matching=muscleSessions(current,templates,slug);
    const weekly=new Map<string,{direct:number;secondary:number;sessions:number;volume:number|null}>();
    const exercises=new Map<string,{title:string;sets:number;points:{label:string;at:string;value:number;href:string}[]}>();
    const mappedByWorkout=new Map<string,Set<string>>();
    for(const {workout,exercises:involved} of [...matching].reverse()) {
      const week=weekKey(dayKey(workout.started_at));
      const row=weekly.get(week)??{direct:0,secondary:0,sessions:0,volume:null};
      row.sessions++;
      const bestLoads=new Map<string,number>();
      for(const {exercise,template,sets,direct} of involved) {
        row[direct?'direct':'secondary']+=sets.length;
        const entry=exercises.get(exercise.template_id)??{title:exercise.title,sets:0,points:[]};
        entry.sets+=sets.length;
        exercises.set(exercise.template_id,entry);
        for(const set of sets) {
          const load=volume(set,template);
          if(direct&&load!=null) row.volume=(row.volume??0)+load;
          if(loaded(template)&&set.weight_kg!=null&&set.weight_kg>0) bestLoads.set(exercise.template_id,Math.max(bestLoads.get(exercise.template_id)??0,set.weight_kg));
        }
      }
      for(const [id,value] of bestLoads) exercises.get(id)!.points.push({label:short(workout.started_at,locale),at:workout.started_at,value,href:workoutHref(workout.id)});
      weekly.set(week,row);
      mappedByWorkout.set(workout.id,new Set(involved.map(({exercise})=>exercise.template_id)));
    }
    const today=dayKey(new Date());
    const weeklySeries=([{key:'direct',label:'Direct working sets',unit:'sets'},{key:'secondary',label:'Secondary working sets',unit:'sets'},{key:'volume',label:'Direct volume load',unit:'kg × reps'},{key:'sessions',label:'Training frequency',unit:'sessions'}] as const).map(metric=>({
      ...metric,points:[...weekly].flatMap(([at,row])=>row[metric.key]==null?[]:[{at,label:short(at,locale),value:row[metric.key]!,incomplete:at===weekKey(today)||Boolean(days&&at<shiftDay(today,1-days))}]),
    }));
    const progression=[...exercises].filter(([,row])=>row.points.length).map(([key,row])=>({key,label:row.title,unit:'kg',points:row.points,detailScale:true}));
    const records=bestRecords(workouts,templates).filter(record=>mappedByWorkout.get(record.workout)?.has(record.key.slice(0,record.key.lastIndexOf('|'))));
    const loads=[...weekly.values()].flatMap(row=>row.volume??[]);
    return <><Heading section="MUSCLE ANALYTICS" title={name} description="Working sets attributed using exercise mappings.">{filter}</Heading>
      <Stats items={[{label:'Sessions',value:number(totals[slug].sessions,0,locale)},{label:'Direct sets',value:number(totals[slug].direct,0,locale)},{label:'Secondary sets',value:number(totals[slug].secondary,0,locale)},{label:'Direct volume load',value:formatUnit(loads.length?sum(loads):null,'kg × reps',1,locale)}]}/>
      <div className="split"><Card title="Weekly training" subtitle="Direct volume sums supported working-set weight multiplied by repetitions."><MetricChart series={weeklySeries} locale={locale}/></Card>
      <Card title="Anatomical map"><Anatomy totals={totals} selected={slug} preview={preview} days={days} locale={locale}/></Card></div>
      <div className="split"><Card title="Exercise progression" subtitle="Maximum recorded working-set load per session.">{progression.length?<MetricChart series={progression} locale={locale} selectorLabel="Exercise"/>:<Empty>No supported loaded exercise observations in this period.</Empty>}</Card>
      <Card title="Involving exercises">{exercises.size?<div className="rows">{[...exercises].sort((a,b)=>b[1].sets-a[1].sets).map(([id,row])=><Link className="row" key={id} href={'/app/exercises/'+encodeURIComponent(id)+'?days='+days}>{row.title}<span>{number(row.sets,0,locale)} sets</span></Link>)}</div>:<Empty>No mapped exercises in this period.</Empty>}</Card></div>
      <Disclosure title="Personal records in period"><RecordRows records={records} locale={locale}/></Disclosure>
      <Disclosure title="Involving workouts"><WorkoutRows workouts={matching.map(({workout})=>workout)} templates={templates} locale={locale}/></Disclosure></>;
  }
  if(tab==='wrapped'){
    const m=current.map(w=>workoutMetrics(w,templates)), totals=muscleTotals(current,templates);
    const top=Object.entries(totals).sort((a,b)=>b[1].direct-a[1].direct).find(([,v])=>v.direct>0);
    return <><Heading section="TRAINING WRAPPED" title="Your training in review" description="A recap of the selected training period.">{filter}</Heading><div className="wrapped-hero"><Activity/><p>WORKOUTS LOGGED</p><strong>{current.length}</strong><span>{number(sum(m.map(v=>v.minutes))/60,1,locale)} training hours</span></div><Stats items={[{label:'Most direct sets',value:top?muscles[top[0] as keyof typeof muscles]:'—'},{label:'Longest streak',value:streaks(current,dayKey(new Date())).longest+' days'},{label:'Working sets',value:sum(m.map(v=>v.sets))},{label:'Records set in period',value:bestRecords(workouts,templates).filter(r=>current.some(w=>w.id===r.workout)).length}]}/><Card title="Activity calendar"><ActivityCalendar workouts={current}/></Card></>;
  }
  return <><Heading section="PERFORMANCE" title="Training analytics" description="Measure working-set volume and workout frequency over time.">{filter}</Heading><AthleteNav preview={preview}/><Card title="Training performance" subtitle="Weekly training totals and dated weigh-ins"><TrainingPerformanceChart {...data} workouts={current} days={days}/></Card><Card title="Training frequency"><ActivityCalendar workouts={current}/></Card></>;
}
export function Body({rows,locale='en-GB',preview=false}:{rows:Measurement[];locale?:Locale;preview?:boolean}){
  const weights=rows.filter(r=>r.kind==='weight').sort((a,b)=>a.day.localeCompare(b.day));
  const latest=weights.at(-1), today=dayKey(new Date());
  return <><Heading section="BODY ANALYTICS" title="Body measurements" description="Track bodyweight and measurements over time."/><Stats items={[{label:'Latest bodyweight',value:latest?number(latest.value,2,locale)+' kg':'—',icon:Weight},{label:'7-day average',value:latest?number(movingAverage(weights,today,7),2,locale):'—',note:'kg'},{label:'30-day average',value:latest?number(movingAverage(weights,today,30),2,locale):'—',note:'kg'}]}/>
  <div className="split"><Card title="Bodyweight trend"><Trend locale={locale} unit="kg" detailScale points={weights.map(r=>({label:short(r.day,locale),value:r.value,at:r.day}))}/></Card><Card title="Add a measurement">{preview?<Empty>Sign in after configuring Supabase to save measurements.</Empty>:<form className="form" action={measurement}><label>Date<input name="day" type="date" defaultValue={today} required/></label><label>Measurement<select name="kind">{Object.entries(measurementLabels).map(([k,v])=><option key={k} value={k}>{v} ({measureUnit(k)})</option>)}</select></label><label>Value<input name="value" type="number" min=".01" max="700" step=".01" required/></label><button className="button">Save measurement</button></form>}</Card></div>
  <Disclosure title="Measurement history">{rows.length?<div className="rows">{rows.map(r=><details key={r.id}><summary><span><strong>{measurementLabels[r.kind as keyof typeof measurementLabels]}</strong><small>{short(r.day,locale)} · {r.source}</small></span><span>{formatUnit(r.value,measureUnit(r.kind),2,locale)}</span></summary>{r.source==='manual'&&<form className="inline detail" action={measurement}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="kind" value={r.kind}/><input type="date" name="day" aria-label="Measurement date" defaultValue={r.day} required/><input type="number" name="value" aria-label="Measurement value" defaultValue={r.value} min=".01" max="700" step=".01" required/><button className="button secondary">Save</button><button name="mode" value="delete" className="quiet">Delete</button></form>}</details>)}</div>:<Empty>No measurements recorded.</Empty>}</Disclosure></>;
}
export function GoalView({goals,workouts,rows,preview=false}:{goals:Goal[];workouts:Pick<Workout,'started_at'>[];rows:Measurement[];preview?:boolean}){
  const date=dayKey(new Date());
  return <><Heading section="PERFORMANCE" title="Goals" description="Set measurable targets for attendance and bodyweight."/><div className="split"><Card title="Your targets">{goals.length?goals.map(g=>{
    const start=g.kind==='weekly_workouts'?weekKey(date):dayKey(g.created_at);
    const end=g.deadline&&g.deadline<date?g.deadline:date;
    const current=g.kind==='weight'?(rows.filter(r=>r.kind==='weight'&&r.day<=end).sort((a,b)=>b.day.localeCompare(a.day))[0]?.value??null):workouts.filter(w=>{const d=dayKey(w.started_at);return d>=start&&d<=end;}).length;
    return <div className="goal-row" key={g.id}><h3>{g.title}</h3><p>{current??'—'} / {g.target}{g.kind==='weight'?' kg':' workouts'} · {g.status}{g.deadline?' · '+g.deadline:''}</p>{g.kind!=='weight'&&<progress aria-label={g.title} max={g.target} value={Math.min(current??0,g.target)}/>}<form className="inline" action={goal}><input type="hidden" name="id" value={g.id}/><button className="quiet" name="status" value={g.status==='active'?'paused':'active'}>{g.status==='active'?'Pause':'Activate'}</button>{g.status!=='archived'&&<button className="quiet" name="status" value="archived">Archive</button>}</form></div>;
  }):<Empty>No goals created.</Empty>}</Card><Card title="Create a goal">{preview?<Empty>Sign in to create a goal.</Empty>:<form className="form" action={goal}><label>Title<input name="title" maxLength={100} required/></label><label>Metric<select name="kind"><option value="workouts">Workout count</option><option value="weekly_workouts">Workouts per week</option><option value="weight">Bodyweight (kg)</option></select></label><label>Target<input type="number" name="target" min=".01" step=".01" required/></label><label>Deadline<input type="date" name="deadline"/></label><button className="button">Create goal</button></form>}</Card></div></>;
}
export function IntegrationView({available,syncAt,lastError,preview=false}:{available:boolean;syncAt:string|null;lastError?:string|null;preview?:boolean}){
  return <><Heading section="WORKSPACE" title="Integrations" description="Bring your training history into your private workspace."/><div className="split"><Card title="Hevy" subtitle={syncAt?'Last successful sync · '+new Date(syncAt).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'}):'No successful synchronization yet'}>{available?<><p className="muted">Synchronize workout history and exercise templates from Hevy Pro.</p><HevySyncForm/></>:<Empty>Configure a fresh Hevy API key and your Supabase user ID in the server environment.</Empty>}{lastError&&<p role="status">{lastError}</p>}</Card><Card title="Import a Hevy CSV" subtitle="Use a workout export under 1.5 MB.">{preview?<Empty>Configure Supabase and sign in to import a file.</Empty>:<form className="form" action={importCsv}><label>Workout export<input type="file" name="csv" accept=".csv,text/csv" required/></label><button className="button">Import CSV</button><small>CSV records use a separate exercise namespace. Importing the same history through both sources can duplicate sessions.</small></form>}</Card></div></>;
}
export function SettingsView({theme,email,locale='en-GB',mfaEnabled=false,preview=false}:{theme:string;locale?:Locale;email?:string;mfaEnabled?:boolean;preview?:boolean}){
  return <><Heading section="WORKSPACE" title="Settings" description="Manage your account and appearance."><Link className="quiet" href={preview?'/?tab=integrations':'/app/integrations'}><Plug size={15}/>Integrations</Link></Heading><div className="split"><Card title="Appearance">{preview?<Empty>Sign in to save appearance preferences.</Empty>:<form className="form" action={preferences}><label>Theme<select name="theme" defaultValue={theme}><option value="dark">Charcoal</option><option value="oled">OLED black</option><option value="light">Light</option></select></label><label>Number and date format<select name="locale" defaultValue={locale}><option value="en-GB">English (United Kingdom)</option><option value="nl-NL">Nederlands (Nederland)</option></select></label><button className="button">Save appearance</button></form>}</Card><Card title="Account" subtitle={email}>{preview?<Empty>Configure Supabase to enable invite-only access.</Empty>:<><form className="form" action={setPassword}><label>New password<input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required/></label><button className="button secondary">Update password</button></form><MfaEnrollment enabled={mfaEnabled}/><div className="inline"><Link className="quiet" href="/app/export">Export JSON</Link><form action={logout}><button className="quiet">Sign out</button></form></div></>}</Card></div></>;
}
