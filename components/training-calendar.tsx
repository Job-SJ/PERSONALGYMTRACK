'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {shiftDay, weekKey} from '../lib/analytics';
import {formatDate, formatNumber, type Locale} from '../lib/format';

export type CalendarSession = {id:string; title:string; day:string; sets:number; minutes:number; muscles:string[]};
type View = 'Month' | 'Week' | 'Year';
const views:View[] = ['Month','Week','Year'];
const metrics = {workouts:'Workouts', sets:'Working sets', minutes:'Minutes'} as const;
type Metric = keyof typeof metrics;
const weekday = (day:string) => new Date(day).getUTCDay();
const monthOffset = (day:string, offset:number) => {
  const date = new Date(day);
  return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+offset,1)).toISOString().slice(0,10);
};
const yearOffset = (day:string,offset:number) => String(Number(day.slice(0,4))+offset)+'-01-01';
const daysBetween = (start:string,end:string) => Math.round((Date.parse(end)-Date.parse(start))/86_400_000);

export function TrainingCalendar({sessions,today,locale}:{sessions:CalendarSession[];today:string;locale:Locale}) {
  const [view,setView] = useState<View>('Month');
  const [anchor,setAnchor] = useState(today);
  const [selected,setSelected] = useState(today);
  const [mondayFirst,setMondayFirst] = useState(true);
  const [metric,setMetric] = useState<Metric>('workouts');
  const month = monthOffset(anchor,0);
  const year = yearOffset(anchor,0);
  const weekStart = (day:string) => mondayFirst ? weekKey(day) : shiftDay(day,-weekday(day));
  const start = view==='Month'?month:view==='Week'?weekStart(anchor):year;
  const end = view==='Month'?monthOffset(anchor,1):view==='Week'?shiftDay(start,7):yearOffset(anchor,1);
  const gridStart = weekStart(start);
  const count = Math.ceil(daysBetween(gridStart,end)/7)*7;
  const days = Array.from({length:count},(_,i)=>shiftDay(gridStart,i));
  const byDay = new Map<string,CalendarSession[]>();
  for(const session of sessions) {
    const list = byDay.get(session.day) ?? [];
    list.push(session);
    byDay.set(session.day,list);
  }
  const value = (rows:CalendarSession[],key:Metric) => key==='workouts'?rows.length:rows.reduce((total,row)=>total+row[key],0);
  const inPeriod = sessions.filter(s=>s.day>=start&&s.day<end);
  const max = Math.max(0,...days.map(day=>value(byDay.get(day)??[],metric)));
  const current = today>=start&&today<end;
  const weekDays = days.slice(0,7);
  const dateLabel = (day:string) => formatDate(day,locale,{day:'numeric',month:'long',year:'numeric'});
  const navigate = (direction:number) => {
    const next = view==='Month'?monthOffset(anchor,direction):view==='Week'?shiftDay(start,7*direction):yearOffset(anchor,direction);
    setAnchor(next);
    setSelected(next);
  };
  const matchedDays = view==='Week'?Math.max(0,Math.min(7,daysBetween(start,today))):0;
  const priorStart = shiftDay(start,-7);
  const prior = sessions.filter(s=>s.day>=priorStart&&s.day<shiftDay(priorStart,matchedDays));
  const elapsed = inPeriod.filter(s=>s.day<shiftDay(start,matchedDays));

  function cell(day:string) {
    const rows = byDay.get(day)??[];
    const n = value(rows,metric);
    const level = n===0?0:Math.ceil(3*n/max);
    const out = day<start||day>=end;
    const label = dateLabel(day)+', '+(day>today?'upcoming':view==='Year'?`${formatNumber(n,1,locale)} ${metrics[metric].toLowerCase()}`:rows.length?`${rows.length} workout${rows.length===1?'':'s'}`:'no workouts recorded');
    return <button className={view==='Year'?'heat-cell heat-'+level:'calendar-day'} key={day} type="button"
      aria-label={label} title={label} aria-pressed={selected===day} aria-current={day===today?'date':undefined}
      data-outside={out||undefined} disabled={view==='Year'&&out} onClick={()=>{setSelected(day);if(out)setAnchor(day);}}>
      {view!=='Year'&&<><strong>{Number(day.slice(-2))}</strong>{rows.map(row=><span key={row.id} className="calendar-session">{row.title}</span>)}{view==='Week'&&day<=today&&!rows.length&&<small>No workout</small>}</>}
    </button>;
  }

  const title = view==='Month'?formatDate(start,locale,{month:'long',year:'numeric'}):
    view==='Week'?formatDate(start,locale)+' - '+dateLabel(shiftDay(end,-1)):start.slice(0,4);
  return <div className="training-calendar">
    <div className="calendar-controls">
      <div className="range" role="group" aria-label="Calendar view">{views.map(name=><button key={name} type="button" aria-pressed={view===name} onClick={()=>setView(name)}>{name}</button>)}</div>
      <label><input type="checkbox" checked={mondayFirst} onChange={e=>setMondayFirst(e.target.checked)}/> Monday first</label>
      {view==='Year'&&<label>Heatmap metric <select value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{Object.entries(metrics).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
    </div>
    <div className="calendar-controls">
      <h3>{title}{current&&<small> In progress</small>}</h3>
      <div className="calendar-controls"><button type="button" className="quiet" aria-label="Previous period" onClick={()=>navigate(-1)}><ChevronLeft size={16}/></button><button className="quiet" type="button" onClick={()=>{setAnchor(today);setSelected(today);}}>Today</button><button className="quiet" type="button" aria-label="Next period" onClick={()=>navigate(1)}><ChevronRight size={16}/></button></div>
    </div>
    {view==='Year'?<>
      <div className="calendar-scroll" tabIndex={0} aria-label="Scrollable annual activity">
        <div className="calendar-year" style={{gridTemplateColumns:`2.7rem repeat(${days.length/7}, 14px)`}}>
          {days.filter((_,i)=>i%7===0).map((day,i)=>{
            const candidate=day<start?start:day;
            const previous=shiftDay(candidate,-7);
            return candidate.slice(0,7)!==previous.slice(0,7)&&<small className="calendar-month-label" key={day} style={{gridColumn:i+2,gridRow:1}}>{formatDate(candidate,locale,{month:'short'})}</small>;
          })}
          {weekDays.map((day,i)=><small key={day} style={{gridColumn:1,gridRow:i+2}}>{formatDate(day,locale,{weekday:'short'})}</small>)}
          {days.map((day,i)=><div className="calendar-cell-wrap" key={day} style={{gridColumn:Math.floor(i/7)+2,gridRow:i%7+2}}>{cell(day)}</div>)}
        </div>
      </div>
      <div className="legend">{metrics[metric]} per day <span>0 <i/><i/><i/> {formatNumber(max,1,locale)}</span></div>
    </>:<div className={'calendar-grid '+(view==='Week'?'calendar-week':'')}>
      {weekDays.map(day=><small key={day}>{formatDate(day,locale,{weekday:'short'})}</small>)}
      {days.map(cell)}
    </div>}
    <p className="muted">{formatNumber(inPeriod.length,0,locale)} workouts / {formatNumber(value(inPeriod,'sets'),0,locale)} working sets / {formatNumber(value(inPeriod,'minutes'),0,locale)} min</p>
    {matchedDays>0&&sessions.some(s=>s.day<=priorStart)&&<p className="muted">First {matchedDays} completed days vs previous week: {elapsed.length} vs {prior.length} workouts / {value(elapsed,'sets')} vs {value(prior,'sets')} working sets / {formatNumber(value(elapsed,'minutes'),0,locale)} vs {formatNumber(value(prior,'minutes'),0,locale)} min.</p>}
    <section className="calendar-agenda" aria-label="Selected date workouts">
      <h3>{dateLabel(selected)}</h3>
      {(byDay.get(selected)??[]).map(session=><div key={session.id}>
        <Link className="row" href={'/app/workouts/'+encodeURIComponent(session.id)}><strong>{session.title}</strong><span>{formatNumber(session.minutes,0,locale)} min / {formatNumber(session.sets,0,locale)} working sets</span></Link>
        {!!session.muscles.length&&<small>Direct muscle groups: {session.muscles.join(', ')}</small>}
      </div>)}
      {!byDay.has(selected)&&<p className="muted">{selected>today?'Upcoming date.':'No workouts recorded.'}</p>}
    </section>
  </div>;
}
