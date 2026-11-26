import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {dailyIntelligence,intelligencePeriods,intelligenceWindows,type IntelligencePeriod} from '../lib/daily-intelligence';
import {formatDate,type Locale} from '../lib/format';

type ReportInput=Parameters<typeof dailyIntelligence>[0];
type Diary={trend:NonNullable<ReportInput['nutrition']>}|null;
const badge=(days:number)=>days+'D';

function Sparkline({points}:{points:number[]}){
  if(points.length<3) return null;
  const min=Math.min(...points), max=Math.max(...points);
  const spread=Math.max(max-min,Math.abs(max)*0.1);
  const coordinates=points.map((value,i)=>[
    2+i*72/(points.length-1),spread===0?11:11-(value-(max+min)/2)*16/spread,
  ].join(',')).join(' ');
  return <svg className="intelligence-sparkline" viewBox="0 0 76 22" aria-hidden="true">
    <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export function IntelligenceLoading(){
  return <section className="intelligence intelligence-loading" aria-busy="true" aria-label="Daily Intelligence">
    <p className="eyebrow">Daily Intelligence</p>
    <p role="status">Comparing your training periods…</p>
    <div className="intelligence-loading-line" aria-hidden="true"/>
  </section>;
}

export async function DailyIntelligence({input,diary,chartDays,preview,updatedAt}:{
  input:ReportInput;diary?:Promise<Diary>;chartDays:number;preview:boolean;updatedAt:string;
}){
  const nutrition=await diary;
  const {headline,summary,indicators,insights,through}=dailyIntelligence({...input,nutrition:nutrition?.trend});
  const locale:Locale=input.locale??'en-GB';
  const window=intelligenceWindows[input.days];
  const url=(period:IntelligencePeriod)=>{
    const query=new URLSearchParams({intelligence:String(period)});
    if(chartDays!==90) query.set('days',String(chartDays));
    return (preview?'/':'/app')+'?'+query;
  };
  return <section className="intelligence" aria-labelledby="intelligence-title">
    <div className="intelligence-top">
      <div>
        <p className="eyebrow">Daily Intelligence</p>
        <h1 id="intelligence-title">{headline}</h1>
        <p className="intelligence-summary">{summary}</p>
      </div>
      <nav className="range intelligence-period" aria-label="Intelligence period">
        {intelligencePeriods.map(period=><Link key={period} href={url(period)} aria-current={period===input.days?'true':undefined}
          aria-label={period+' days'} prefetch={false} scroll={false}>{badge(period)}</Link>)}
      </nav>
    </div>
    <dl className="intelligence-metrics" key={input.days}>
      {indicators.map(({label,value,detail,points,tone})=><div className="intelligence-metric" key={label}>
        <dt>{label}</dt>
        <dd data-tone={tone}><div className="intelligence-reading"><strong>{value}</strong><Sparkline points={points}/></div><p>{detail}</p></dd>
      </div>)}
    </dl>
    {!!insights.length&&<ul className="intelligence-insights" aria-label="Training insights">
      {insights.map(({key,title,detail,href})=><li key={key}>
        <Link href={href} prefetch={false}><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight size={16} aria-hidden="true"/></Link>
      </li>)}
    </ul>}
    <div className="intelligence-footer">
      <details>
        <summary>How it’s calculated</summary>
        <ul>
          <li>Each period uses completed days in Europe/Amsterdam and compares them with the preceding equal period.</li>
          <li>Strength compares each exercise’s median daily best Epley estimated 1RM. Each period needs at least three training dates spanning {window.minSpan} days, with a recent observation in the last {window.recentDays} completed days. The displayed change is the median across qualifying lifts. A directional trend needs a change of at least 3% and support from two thirds of recent observations, including the latest two.</li>
          <li>Volume is positive external load multiplied by reps in mapped working sets. Each period needs at least two workouts with load and coverage of at least 75% of recorded workouts.</li>
          <li>Consistency counts unique training dates. A prior comparison needs at least three recorded dates and history reaching the start of the comparison window.</li>
          <li>Relative estimates use a weigh-in from the session date or the preceding seven days. Intake uses diary days marked complete with known calories. These are observations about your recorded data.</li>
        </ul>
      </details>
      {!preview&&<small>Updated <time dateTime={updatedAt}>{formatDate(updatedAt,locale,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time>
        {nutrition===null&&<span> · Nutrition trends unavailable</span>}<span className="sr-only"> · Comparisons through {formatDate(through,locale)}</span></small>}
    </div>
  </section>;
}
