import Link from 'next/link';
import {Activity,CalendarDays,Clock3,Dumbbell,Flame,Layers3,Plug,Target,Trophy,Weight} from 'lucide-react';
import {bestRecords,dayKey,estimate,loaded,movingAverage,muscles,muscleKey,muscleTotals,relativeStrength,shiftDay,streaks,sum,trainingFrequencyComparison,volume,weekKey,working,workoutMetrics} from '../lib/analytics';
import type {Goal,Measurement,Template,Workout} from '../lib/model';
import {Anatomy} from './anatomy';
import {Trend} from './charts';
import {RepMaxCalculator} from './calculator';
import {MfaEnrollment} from './mfa-enrollment';
import {HevySyncForm} from './hevy-sync-form';
import {goal,importCsv,logout,measurement,preferences,setPassword} from '../app/actions';

const number=(v:number|null|undefined,digits=0)=>v==null?'—':v.toLocaleString('en-GB',{maximumFractionDigits:digits});
const short=(d:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d));
const measurementLabels={weight:'Bodyweight',body_fat:'Body fat',muscle_mass:'Muscle mass',waist:'Waist',arm:'Arm',chest:'Chest',thigh:'Thigh',calf:'Calf'};
const measureUnit=(kind:string)=>kind==='body_fat'?'%':kind==='weight'||kind==='muscle_mass'?'kg':'cm';
type Data={workouts:Workout[];templates:Map<string,Template>;measurements:Measurement[]};
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
function Stats({items}:{items:{label:string;value:string|number;note?:string;icon?:typeof Activity}[]}){
  return <div className="stats">{items.map(({label,value,note,icon:Icon})=><section className="stat" key={label}><div><span>{label}</span>{Icon&&<Icon size={16}/>}</div><strong>{value}</strong>{note&&<small>{note}</small>}</section>)}</div>;
}
function ActivityCalendar({workouts}:{workouts:Workout[]}){
  const count=new Map<string,number>();
  for(const w of workouts){const key=dayKey(w.started_at);count.set(key,(count.get(key)??0)+1);}
  const today=dayKey(new Date()), start=shiftDay(weekKey(today),-7*25);
  return <><div className="calendar-scroll"><div className="heat-grid">{Array.from({length:182},(_,i)=>{const day=shiftDay(start,i);const n=count.get(day)??0;return <span key={day} className={'heat-cell heat-'+Math.min(n,3)} title={day+' · '+n+' workouts'}/>;})}</div></div><p className="legend">Last 26 weeks <span>Fewer <i/><i/><i/> More</span></p><details className="chart-data"><summary>View active dates</summary>{count.size?<ul>{[...count].sort().reverse().slice(0,182).map(([d,n])=><li key={d}>{d} · {n}</li>)}</ul>:<p>No workout dates.</p>}</details></>;
}
function VolumeChart({workouts,templates}:{workouts:Workout[];templates:Map<string,Template>}){
  const weeks=new Map<string,number>();
  for(const w of workouts){const week=weekKey(dayKey(w.started_at));const v=workoutMetrics(w,templates).volume;if(v!=null) weeks.set(week,(weeks.get(week)??0)+v);}
  return <Trend unit="kg × reps" points={[...weeks].sort().map(([d,value])=>({label:short(d),value,at:d}))}/>;
}
export function Dashboard({workouts,templates,measurements,days,syncAt,preview=false}:Data&{days:number;syncAt:string|null;preview?:boolean}){
  const current=inRange(workouts,days), totals=muscleTotals(current,templates);
  const m=current.map(w=>workoutMetrics(w,templates));
  const values=m.flatMap(v=>v.volume??[]);
  const today=dayKey(new Date()), week=weekKey(today), month=today.slice(0,7), year=today.slice(0,4);
  const dates=workouts.map(w=>dayKey(w.started_at)).filter(d=>d<=today);
  const streak=streaks(workouts,today);
  const recent=bestRecords(workouts,templates).slice(0,5);
  const base=preview?'/?tab=dashboard':'/app';
  const weight=measurements.filter(r=>r.kind==='weight').sort((a,b)=>b.day.localeCompare(a.day))[0];
  const previous=shiftDay(week,-7);
  const thisWeek=dates.filter(d=>d>=week).length;
  const lastWeek=dates.filter(d=>d>=previous&&d<week).length;
  const frequency=trainingFrequencyComparison(workouts,today);
  const top=Object.entries(totals).sort((a,b)=>b[1].direct-a[1].direct).find(([,v])=>v.direct>0);
  return <><Heading section="TRAINING OVERVIEW" title="Dashboard" description="Your training volume, muscle distribution and recent activity." ><Range days={days} base={base}/></Heading>
  {preview&&<div className="setup"><span className="setup-icon"><Plug size={19}/></span><div><strong>Connect your training data</strong><p>Configure Supabase to import workouts and unlock your personal analytics.</p></div><Link href="/?tab=integrations" className="button">Integration setup</Link></div>}
  <Stats items={[{label:'Workouts',value:number(current.length),note:`${thisWeek} this week · ${dates.filter(d=>d.startsWith(month)).length} this month`,icon:Dumbbell},{label:'Recorded volume',value:values.length?number(sum(values))+' kg ? reps':'—',note:'Working sets · supported lifts',icon:Layers3},{label:'Training time',value:current.length?number(sum(m.map(v=>v.minutes))/60,1)+' h':'—',note:current.length?number(sum(m.map(v=>v.minutes))/current.length)+' min / workout':'Across selected workouts',icon:Clock3},{label:'Working sets',value:number(sum(m.map(v=>v.sets))),note:number(sum(m.map(v=>v.reps)))+' recorded reps',icon:Activity}]}/>
  <div className="split dashboard-primary"><Card title="Training performance" subtitle="Weekly recorded volume load" action={<span className="key"><i/> Volume</span>}><VolumeChart workouts={current} templates={templates}/></Card><Card title="Muscle distribution" subtitle="Direct working sets by region" action={<Target size={17}/>}><Anatomy totals={totals} preview={preview}/><div className="legend">Direct sets <span>0 <i/><i/><i/> {Math.max(...Object.values(totals).map(t=>t.direct))||'—'}</span></div></Card></div>
  <div className="split lower"><Card title="Training activity" subtitle="Workouts recorded each day" action={<CalendarDays size={17}/>}><ActivityCalendar workouts={workouts}/></Card><Card title="Training patterns" subtitle="Current week and all-time benchmarks" action={<Flame size={17}/>}><dl className="facts"><dt>Workouts vs. last week</dt><dd>{dates.length?number(thisWeek-lastWeek):'—'}</dd><dt>Current / longest streak</dt><dd>{streak.current} / {streak.longest} days</dd><dt>Most direct sets</dt><dd>{top?muscles[top[0] as keyof typeof muscles]:'—'}</dd><dt>Workouts year to date</dt><dd>{dates.filter(d=>d.startsWith(year)).length}</dd><dt>Latest bodyweight</dt><dd>{weight?number(weight.value,1)+' kg':'—'}</dd></dl></Card></div>
  <div className="split"><Card title="Recent workouts" subtitle={syncAt?'Last Hevy sync · '+short(syncAt):'Hevy sync has yet to run'}><WorkoutRows workouts={current.slice(0,5)} templates={templates}/></Card><Card title="Latest personal records" action={<Trophy size={17}/>}><RecordRows records={recent}/></Card></div>
  {frequency&&<Card title="Training frequency insight" subtitle="Two consecutive 28-day periods, excluding today"><p>{frequency.current} workouts from {short(frequency.currentStart)} to {short(frequency.currentEnd)}, compared with {frequency.previous} from {short(frequency.priorStart)} to {short(frequency.priorEnd)}.</p><small>Counts reflect recorded workouts and depend on complete import coverage.</small></Card>}</>;
}
function WorkoutRows({workouts,templates}:{workouts:Workout[];templates:Map<string,Template>}){
  return workouts.length?<div className="rows">{workouts.map(w=>{const m=workoutMetrics(w,templates);return <details key={w.id}><summary><span><strong>{w.title}</strong><small>{short(w.started_at)} · {number(m.minutes)} min · {m.sets} working sets</small></span><span>{m.volume==null?'—':number(m.volume)+' kg ? reps'}</span></summary><div className="detail">{w.notes&&<p>{w.notes}</p>}{[...w.workout_exercises].sort((a,b)=>a.position-b.position).map(e=><section key={e.position}><h3><Link href={'/app/exercises/'+encodeURIComponent(e.template_id)}>{e.title}</Link></h3>{e.notes&&<p>{e.notes}</p>}<table><thead><tr><th>Set</th><th>Load</th><th>Reps</th><th>Other</th><th>RPE</th></tr></thead><tbody>{[...e.workout_sets].sort((a,b)=>a.position-b.position).map(s=><tr key={s.position}><td>{s.position+1} · {s.type}</td><td>{s.weight_kg==null?'—':number(s.weight_kg,2)+' kg'}</td><td>{s.reps??'—'}</td><td>{s.duration_seconds!=null?s.duration_seconds+' s':s.distance_meters!=null?s.distance_meters+' m':'—'}</td><td>{s.rpe??'—'}</td></tr>)}</tbody></table></section>)}</div></details>;})}</div>:<Empty>No workouts in this view.</Empty>;
}
function RecordRows({records}:{records:ReturnType<typeof bestRecords>}){
  return records.length?<div className="rows">{records.map(r=><div className="row" key={r.key+r.workout}><span><strong>{r.title}</strong><small>{r.metric} · {short(r.at)}</small></span><span>{number(r.value,1)} {r.metric==='Bodyweight reps'?'reps':r.metric==='Exercise volume'?'kg × reps':'kg'}</span></div>)}</div>:<Empty>No comparable records are available yet.</Empty>;
}
export function TrainingView({data,tab,slug,days,q,formula,preview=false}:{data:Data;tab:string;slug?:string;days:number;q?:string;formula?:string;preview?:boolean}){
  const {workouts,templates}=data;
  const current=inRange(workouts,days);
  const base=preview?'/?tab='+tab:'/app/'+tab+(slug?'/'+encodeURIComponent(slug):'');
  const filter=<Range days={days} base={base}/>;
  const list=new Map(workouts.flatMap(w=>w.workout_exercises.map(e=>[e.template_id,e.title] as const)));
  const rangeLabel='Selected period · Europe/Amsterdam';
  if(tab==='workouts') {
    const query=q?.trim().toLowerCase();
    const shown=query?current.filter(w=>w.title.toLowerCase().includes(query)||w.workout_exercises.some(e=>e.title.toLowerCase().includes(query))):current;
    return <><Heading section="TRAINING" title="Workout history" description={rangeLabel}>{filter}</Heading><Card title="Sessions" subtitle={shown.length+' workouts'}><form className="inline"><input type="hidden" name={preview?'tab':'days'} value={preview?'workouts':days}/><input name="q" defaultValue={q} aria-label="Search workouts" placeholder="Search workouts or exercises"/><button className="button secondary">Search</button></form><WorkoutRows workouts={shown} templates={templates}/></Card></>;
  }
  if(tab==='calendar') return <><Heading section="OVERVIEW" title="Training calendar" description="Workout frequency by local date."/><Card title="Activity calendar"><ActivityCalendar workouts={workouts}/></Card></>;
  if(tab==='records') return <><Heading section="TRAINING" title="Personal records" description="Session-best performances that exceeded an earlier value or established a baseline.">{filter}</Heading><Card title="Record history"><RecordRows records={bestRecords(workouts,templates).filter(r=>current.some(w=>w.id===r.workout))}/></Card></>;
  if(tab==='exercises'&&slug) {
    const name=list.get(slug);
    if(!name) return <><Heading section="EXERCISES" title="Exercise unavailable" description="This exercise has no recorded workout history."/><Link href="/app/exercises">Exercise library</Link></>;
    const t=templates.get(slug);
    const sessions=current.filter(w=>w.workout_exercises.some(e=>e.template_id===slug));
    const sets=sessions.flatMap(w=>w.workout_exercises.filter(e=>e.template_id===slug).flatMap(e=>e.workout_sets.filter(working)));
    const method=formula==='brzycki'?'brzycki':'epley';
    const estimates=[...sessions].reverse().flatMap(w=>{
      const values=w.workout_exercises.filter(e=>e.template_id===slug).flatMap(e=>e.workout_sets.filter(working).flatMap(s=>loaded(t)?estimate(s.weight_kg??0,s.reps??0,method)??[]:[]));
      return values.length?[{label:short(w.started_at),value:Math.max(...values),at:w.started_at}]:[];
    });
    const loads=sets.flatMap(s=>loaded(t)&&s.weight_kg!=null&&s.weight_kg>0?s.weight_kg:[]);
    const volumes=sets.flatMap(s=>volume(s,t)??[]);
    const latest=estimates.at(-1);
    const ratio=latest?relativeStrength(latest.value,latest.at,data.measurements):null;
    return <><Heading section="EXERCISE ANALYTICS" title={name} description={rangeLabel}>{filter}</Heading>
    <Stats items={[{label:'Sessions',value:sessions.length},{label:'Max load',value:loads.length?number(Math.max(...loads),2)+' kg':'—'},{label:'Recorded volume',value:volumes.length?number(sum(volumes))+' kg ? reps':'—'},{label:'Latest relative strength',value:ratio==null?'—':number(ratio,2)+'×',note:'Estimated 1RM / recent bodyweight'}]}/>
    <Card title="Estimated 1RM progression" subtitle="External loads with 1–10 reps. Estimates depend on effort and technique." action={<Link className="button secondary" href={base+'?days='+days+'&formula='+(method==='epley'?'brzycki':'epley')}>{method==='epley'?'Use Brzycki':'Use Epley'}</Link>}><Trend unit="kg" points={estimates}/><RepMaxCalculator/></Card>
    <Card title="Exercise records"><RecordRows records={bestRecords(workouts,templates).filter(r=>r.key.startsWith(slug+'|'))}/></Card><Card title="Workout history"><WorkoutRows workouts={sessions} templates={templates}/></Card></>;
  }
  if(tab==='exercises') return <><Heading section="TRAINING" title="Exercise library" description="Exercises recorded in your workout history."/><Card title="Recorded exercises">{list.size?<div className="rows">{[...list].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,label])=><Link key={id} className="row" href={'/app/exercises/'+encodeURIComponent(id)}>{label}<Dumbbell size={15}/></Link>)}</div>:<Empty>Import workouts to populate the exercise library.</Empty>}</Card></>;
  if(tab==='muscles'){
    const totals=muscleTotals(current,templates), name=slug&&Object.hasOwn(muscles,slug)?muscles[slug as keyof typeof muscles]:undefined;
    const matching=current.filter(w=>w.workout_exercises.some(e=>{const t=templates.get(e.template_id);return slug&&[t?.primary_muscle,...(t?.secondary_muscles??[])].some(k=>muscleKey(k)===slug)&&e.workout_sets.some(working);}));
    const weekly=new Map<string,number>();
    if(name&&slug) for(const w of matching){const week=weekKey(dayKey(w.started_at));const n=muscleTotals([w],templates)[slug].direct;weekly.set(week,(weekly.get(week)??0)+n);}
    return <><Heading section="MUSCLE ANALYTICS" title={name||'Full body overview'} description="Direct and secondary working sets from exercise template mappings.">{filter}</Heading>
      {name&&<Stats items={[{label:'Sessions',value:totals[slug!].sessions},{label:'Direct sets',value:totals[slug!].direct},{label:'Secondary sets',value:totals[slug!].secondary},{label:'Last trained in range',value:totals[slug!].last?short(totals[slug!].last!):'—'}]}/>}
      <div className="split"><Card title={name?'Direct sets by week':'Muscle groups'}>{name?<Trend unit="working sets" points={[...weekly].sort().map(([day,value])=>({label:short(day),value,at:day}))}/>:<div className="rows">{Object.entries(muscles).map(([k,label])=><Link className="row" key={k} href={(preview?'/?tab=muscles&muscle=':'/app/muscles/')+k}>{label}<span>{totals[k].direct} direct · {totals[k].secondary} secondary</span></Link>)}</div>}</Card><Card title="Anatomical map"><Anatomy totals={totals} selected={slug} preview={preview}/></Card></div>
      {name&&<Card title="Involving workouts"><WorkoutRows workouts={matching} templates={templates}/></Card>}</>;
  }
  if(tab==='wrapped'){
    const m=current.map(w=>workoutMetrics(w,templates)), totals=muscleTotals(current,templates);
    const top=Object.entries(totals).sort((a,b)=>b[1].direct-a[1].direct).find(([,v])=>v.direct>0);
    return <><Heading section="TRAINING WRAPPED" title="Your training in review" description="A recap of the selected training period.">{filter}</Heading><div className="wrapped-hero"><Activity/><p>WORKOUTS LOGGED</p><strong>{current.length}</strong><span>{number(sum(m.map(v=>v.minutes))/60,1)} training hours</span></div><Stats items={[{label:'Most direct sets',value:top?muscles[top[0] as keyof typeof muscles]:'—'},{label:'Longest streak',value:streaks(current,dayKey(new Date())).longest+' days'},{label:'Working sets',value:sum(m.map(v=>v.sets))},{label:'Records set in period',value:bestRecords(workouts,templates).filter(r=>current.some(w=>w.id===r.workout)).length}]}/><Card title="Activity calendar"><ActivityCalendar workouts={current}/></Card></>;
  }
  return <><Heading section="PERFORMANCE" title="Training analytics" description="Measure working-set volume and workout frequency over time.">{filter}</Heading><Card title="Volume load" subtitle="Eligible working sets × recorded external load. Bodyweight and assisted sets are excluded."><VolumeChart workouts={current} templates={templates}/></Card><Card title="Training frequency"><ActivityCalendar workouts={current}/></Card></>;
}
export function Body({rows,preview=false}:{rows:Measurement[];preview?:boolean}){
  const weights=rows.filter(r=>r.kind==='weight').sort((a,b)=>a.day.localeCompare(b.day));
  const latest=weights.at(-1), today=dayKey(new Date());
  return <><Heading section="BODY ANALYTICS" title="Body measurements" description="Track bodyweight and measurements over time."/><Stats items={[{label:'Latest bodyweight',value:latest?number(latest.value,2)+' kg':'—',icon:Weight},{label:'7-day average',value:latest?number(movingAverage(weights,today,7),2):'—',note:'kg'},{label:'30-day average',value:latest?number(movingAverage(weights,today,30),2):'—',note:'kg'}]}/>
  <div className="split"><Card title="Bodyweight trend"><Trend unit="kg" points={weights.map(r=>({label:r.day,value:r.value,at:r.day}))}/></Card><Card title="Add a measurement">{preview?<Empty>Sign in after configuring Supabase to save measurements.</Empty>:<form className="form" action={measurement}><label>Date<input name="day" type="date" defaultValue={today} required/></label><label>Measurement<select name="kind">{Object.entries(measurementLabels).map(([k,v])=><option key={k} value={k}>{v} ({measureUnit(k)})</option>)}</select></label><label>Value<input name="value" type="number" min=".01" max="700" step=".01" required/></label><button className="button">Save measurement</button></form>}</Card></div>
  <Card title="Measurement history">{rows.length?<div className="rows">{rows.map(r=><details key={r.id}><summary><span><strong>{measurementLabels[r.kind as keyof typeof measurementLabels]}</strong><small>{r.day} · {r.source}</small></span><span>{r.value} {measureUnit(r.kind)}</span></summary>{r.source==='manual'&&<form className="inline detail" action={measurement}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="kind" value={r.kind}/><input type="date" name="day" aria-label="Measurement date" defaultValue={r.day} required/><input type="number" name="value" aria-label="Measurement value" defaultValue={r.value} min=".01" max="700" step=".01" required/><button className="button secondary">Save</button><button name="mode" value="delete" className="quiet">Delete</button></form>}</details>)}</div>:<Empty>No measurements recorded.</Empty>}</Card></>;
}
export function GoalView({goals,workouts,rows,preview=false}:{goals:Goal[];workouts:Workout[];rows:Measurement[];preview?:boolean}){
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
export function SettingsView({theme,email,mfaEnabled=false,preview=false}:{theme:string;email?:string;mfaEnabled?:boolean;preview?:boolean}){
  return <><Heading section="WORKSPACE" title="Settings" description="Manage your account and appearance."/><div className="split"><Card title="Appearance">{preview?<Empty>Sign in to save appearance preferences.</Empty>:<form className="form" action={preferences}><label>Theme<select name="theme" defaultValue={theme}><option value="dark">Charcoal</option><option value="oled">OLED black</option><option value="light">Light</option></select></label><button className="button">Save appearance</button></form>}</Card><Card title="Account" subtitle={email}>{preview?<Empty>Configure Supabase to enable invite-only access.</Empty>:<><form className="form" action={setPassword}><label>New password<input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required/></label><button className="button secondary">Update password</button></form><MfaEnrollment enabled={mfaEnabled}/><div className="inline"><Link className="quiet" href="/app/export">Export JSON</Link><form action={logout}><button className="quiet">Sign out</button></form></div></>}</Card></div></>;
}
