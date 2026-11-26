import Link from 'next/link';
import {AthleteNav,athleteHref,type AthleteExperience} from './athlete-nav';
import {LazyFingerprint,LazyMilestones,LazyPassport} from './athlete-interactive';
import {MetricChart} from './metric-chart';
import {fingerprintAxes,fingerprintPeriods,passportFacts,performanceReplay,replayLengths,trainingFingerprint,type HistoryInput} from '../lib/athlete-history';
import {formatDate,formatNumber,formatPercent,formatUnit} from '../lib/format';
import {shiftDay} from '../lib/analytics';

export type AthleteQuery={view?:string;exercise?:string;length?:string;early?:string;late?:string;profile?:string};
const headings={
  replay:{section:'Performance Replay',title:'Look how far you’ve come.'},
  passport:{section:'Strength Passport',title:'Your strength. Your story.'},
  fingerprint:{section:'Training Fingerprint',title:'No two athletes train alike.'},
};

function Replay({data,query,preview}:{data:HistoryInput;query:AthleteQuery;preview:boolean}){
  const replay=performanceReplay(data,query);
  if(!replay) return <p className="athlete-empty">Import workouts to explore your recorded training history.</p>;
  const {windows,length,exercises,selected,baseline,recent,series,milestones,sampled,monthly}=replay;
  const {locale}=data;
  const date=(value:string)=>formatDate(value,locale,{dateStyle:'medium'});
  const windowLabel=(window:{from:string;to:string})=>date(window.from)+' – '+date(window.to);
  const hasComparison=baseline.estimated!=null&&recent.estimated!=null;
  const delta=hasComparison?recent.estimated!/baseline.estimated!-1:null;
  const summary=delta!=null&&selected?
    selected.name+' median estimated 1RM '+(Math.abs(delta)<.0005?'was unchanged':delta>0?'rose '+formatPercent(delta,locale):'fell '+formatPercent(-delta,locale))+
      ' across the selected periods.':selected?'Choose periods with estimates for '+selected.name+' to compare strength.':'Explore your recorded workout frequency. Mapped loaded exercises unlock strength and volume comparisons.';
  const metrics=[
    {label:'Median estimated 1RM',earlier:baseline.estimated,later:recent.estimated,unit:'kg'},
    {label:'Highest recorded working load',earlier:baseline.load,later:recent.load,unit:'kg'},
    {label:'Median relative estimate',earlier:baseline.relative,later:recent.relative,unit:'× bodyweight'},
  ].filter(metric=>metric.earlier!=null||metric.later!=null);
  const volumeRow=(baseline.volume!=null||recent.volume!=null)&&<tr><th scope="row">Recorded working-set volume</th>
    <td>{formatUnit(baseline.volume,'kg × reps',1,locale)}</td><td>{formatUnit(recent.volume,'kg × reps',1,locale)}</td></tr>;
  const countRow=<tr><th scope="row">Recorded workouts</th><td>{formatNumber(baseline.workouts,0,locale)}</td><td>{formatNumber(recent.workouts,0,locale)}</td></tr>;
  return <>
    <form className="athlete-controls" action={preview?'/':'/app/analytics'} method="get" key={[selected?.id,length,windows.baseline.to,windows.recent.to].join('|')}>
      {preview&&<input type="hidden" name="tab" value="analytics"/>}
      <input type="hidden" name="view" value="replay"/>
      {!!exercises.length&&<label>Exercise<select aria-label="Exercise" name="exercise" defaultValue={selected?.id}>{exercises.map(({id,name})=><option key={id} value={id}>{name}</option>)}</select></label>}
      <label>Equal period length<select aria-label="Equal period length" name="length" defaultValue={length}>{replayLengths.map(value=><option key={value} value={value}>{value} days</option>)}</select></label>
      <label>Earlier period ends<input type="date" name="early" min={windows.first} max={windows.last} defaultValue={windows.canCompare?windows.baseline.to:''}/></label>
      <label>Later period ends<input type="date" name="late" min={windows.first} max={windows.last} defaultValue={windows.recent.to}/></label>
      <button className="button" type="submit">Compare periods</button>
    </form>
    <section className="athlete-surface replay-compare" aria-label="Historical comparison">
      <h2>{selected?.name??'Recorded training'}</h2>
      <p className="muted">{summary}</p>
      {!windows.canCompare?<p className="muted">There is no earlier window of this length. Try a shorter period or select a later end date.</p>:
        <div className="detail">
          <table>
            <thead><tr><th>Measure</th><th>Earlier <small>{windowLabel(windows.baseline)}</small></th><th>Later <small>{windowLabel(windows.recent)}</small></th></tr></thead>
            <tbody>
              {metrics.map(metric=><tr key={metric.label}><th scope="row">{metric.label}</th><td>{formatUnit(metric.earlier,metric.unit,1,locale)}</td><td>{formatUnit(metric.later,metric.unit,1,locale)}</td></tr>)}
              {!metrics.length&&<>{countRow}{volumeRow}</>}
            </tbody>
          </table>
          {!!metrics.length&&<details className="athlete-disclosure">
            <summary>Workout totals and sample counts</summary>
            <table>
              <thead><tr><th>Measure</th><th>Earlier</th><th>Later</th></tr></thead>
              <tbody>
                {countRow}{volumeRow}
                <tr><th scope="row">Estimated strength dates</th><td>{baseline.dates}</td><td>{recent.dates}</td></tr>
                {(baseline.relativeDates>0||recent.relativeDates>0)&&<tr><th scope="row">Matched weigh-in dates</th><td>{baseline.relativeDates}</td><td>{recent.relativeDates}</td></tr>}
              </tbody>
            </table>
          </details>}
        </div>}
    </section>
    <section className="athlete-surface athlete-chart" aria-labelledby="replay-history">
      <header><h2 id="replay-history">Recorded history</h2><small>{date(windows.first)} – {date(windows.recent.to)}</small></header>
      <MetricChart key={[selected?.id,windows.recent.to].join('|')} series={series} locale={locale}/>
      {milestones.length>0&&<LazyMilestones key={[selected?.id,windows.recent.to].join('|')} milestones={milestones} locale={locale}/>}
      <details className="athlete-disclosure"><summary>How this comparison works</summary><p>Both windows cover {length} calendar days. An overlapping earlier end date moves back to the last day before the later window. Estimated 1RM uses Epley and eligible working sets of 1–10 reps. Relative estimates use the closest weigh-in on or within seven days before the session. Recorded max load is the heaviest working set in that window.</p>
      <p>Strength and measured volume are shown as observations. {sampled?'Long lift histories display the highest observed value per week or month. ':''}Workout counts represent logged sessions. {monthly?'Long histories group load and frequency by calendar month. ':''}Windows that start before your archive include only the observations available.</p></details>
    </section>
  </>;
}

function Fingerprint({data,query,preview}:{data:HistoryInput;query:AthleteQuery;preview:boolean}){
  const result=trainingFingerprint(data,query.profile);
  const date=(value:string)=>formatDate(value,data.locale,{dateStyle:'medium'});
  return <>
    <div className="fingerprint-context">
      <p className="muted">Completed dates · {date(shiftDay(data.today,-result.days))} – {date(shiftDay(data.today,-1))}</p>
      <nav className="range" aria-label="Fingerprint period">
        {fingerprintPeriods.map(period=><Link key={period} href={athleteHref('fingerprint',preview)+'&profile='+period}
          aria-current={result.days===period?'true':undefined} aria-label={period+' days'} prefetch={false}>{period}D</Link>)}
      </nav>
    </div>
    {result.currentDates<4?<p className="athlete-empty">Log workouts on at least four distinct dates in the selected period to see your training fingerprint.</p>:
      <section className="athlete-surface">
        <div className="fingerprint-heading">
          <h2>{result.archetype?.title??'Your profile is taking shape'}</h2>
          <p>{result.archetype?.reason??'More comparable sessions are needed for a descriptive training profile.'}</p>
        </div>
        <LazyFingerprint profile={result} axes={fingerprintAxes}/>
        <p className="muted athlete-note">The axes describe your logged training style. Higher scores indicate more of a characteristic on that scale, and each one has its own definition.</p>
      </section>}
  </>;
}

export function AthleteExperiences({active,data,query,preview=false,theme='dark'}:{
  active:AthleteExperience;data:HistoryInput;query:AthleteQuery;preview?:boolean;theme?:string;
}){
  const heading=headings[active];
  const facts=active==='passport'?passportFacts(data):[];
  return <>
    <AthleteNav active={active} preview={preview}/>
    <header className="athlete-heading"><p className="eyebrow">{heading.section}</p><h1>{heading.title}</h1></header>
    {active==='replay'?<Replay data={data} query={query} preview={preview}/>:
      active==='fingerprint'?<Fingerprint data={data} query={query} preview={preview}/>:
      facts.length?<LazyPassport facts={facts} initialDark={theme!=='light'}/>:
      <p className="athlete-empty">Import a workout to build your passport from recorded training.</p>}
  </>;
}
