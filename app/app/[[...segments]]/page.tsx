import {cookies} from 'next/headers';
import {Suspense} from 'react';
import {localeCookie,resolveLocale} from '../../../lib/format';
import {notFound} from 'next/navigation';
import {session} from '../../../lib/supabase';
import {credentialsConfigured,integrationCredentials} from '../../../lib/integration-credentials';
import {dataFor,read} from '../../../lib/data';
import type {Workout} from '../../../lib/model';
import {dayKey,shiftDay} from '../../../lib/analytics';
import {diaryCalories,type Entry} from '../../../lib/nutrition';
import {intelligencePeriod} from '../../../lib/daily-intelligence';
import {Shell} from '../../../components/shell';
import {Body,Dashboard,GoalView,IntegrationView,SettingsView,TrainingView,rangeValue} from '../../../components/views';
import Link from 'next/link';
import {athleteExperience} from '../../../components/athlete-nav';
import type {AthleteQuery} from '../../../components/athlete-experiences';

async function NutritionSummary({diary,locale}:{diary:Promise<ReturnType<typeof diaryCalories>|null>;locale:ReturnType<typeof resolveLocale>}){
  const summary=await diary;
  if(!summary) return null;
  const {value,incomplete}=summary.today;
  return <section className="panel dashboard-nutrition">
    <div><h2>Nutrition today</h2><p className="muted">{value>0
      ? `${value.toLocaleString(locale,{maximumFractionDigits:0})} kcal logged${incomplete?' · incomplete calories':''}`
      : incomplete?'Calories unavailable for logged food':'No calories logged today'}</p></div>
    <Link href="/app/nutrition" className="quiet">Open diary</Link>
  </section>;
}

export const maxDuration=120;
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<AthleteQuery&{days?:string;intelligence?:string;q?:string;formula?:string;status?:string}>}){
  const {client,user}=await session();
  const [{segments=[]},query]=await Promise.all([params,searchParams]);
  const [tab='',slug]=segments;
  if (segments.length>2 || !['','workouts','calendar','analytics','exercises','muscles','records','body','goals','wrapped','integrations','settings'].includes(tab) || (slug&&!['exercises','muscles','workouts'].includes(tab))) notFound();
  const intelligence=intelligencePeriod(query.intelligence);
  const athlete=tab==='analytics'?athleteExperience(query.view):undefined;
  const updatedAt=new Date().toISOString(), today=dayKey(updatedAt);
  const dates={start:shiftDay(today,-2*intelligence),end:today};
  const diary=tab===''?Promise.all([
    read<Pick<Entry,'day'|'portion'>>(client,'nutrition_entries','day,portion','day','id',dates),
    read<{day:string}>(client,'nutrition_days','day','day',undefined,dates),
  ]).then(([entries,complete])=>diaryCalories(entries,new Set(complete.map(row=>row.day)),today)).catch(()=>null):undefined;
  const training=!['body','goals','settings','integrations'].includes(tab);
  const [raw,goalWorkouts,mfa,jar,hevyStatus]=await Promise.all([
    dataFor(client,{workouts:training,templates:training,measurements:athlete!=='fingerprint'&&(['','body','goals','analytics'].includes(tab)||(tab==='exercises'&&Boolean(slug))),goals:tab==='goals',sync:tab===''||tab==='integrations'}),
    tab==='goals'?read<Pick<Workout,'started_at'>>(client,'workouts','started_at','started_at','id'):[],
    tab==='settings'?client.auth.mfa.listFactors():null,
    cookies(),
    tab==='integrations'?integrationCredentials({client,user},'hevy').connected().catch(()=>false):false,
  ]);
  const locale=resolveLocale(jar.get(localeCookie)?.value);
  const data={...raw,locale,templates:new Map(raw.templates.map(t=>[t.id,t]))};
  const days=rangeValue(query.days);
  const syncAt=raw.sync?.cursor_at??null;
  const theme=raw.prefs?.theme??'dark';
  if(athlete){
    const {AthleteExperiences}=await import('../../../components/athlete-experiences');
    return <Shell theme={theme}><AthleteExperiences active={athlete} data={{...data,today}} query={query} theme={theme}/></Shell>;
  }
  return <Shell theme={theme}>{query.status&&<div className="notice" role="status">{query.status.slice(0,200)}</div>}
    {tab===''?<Dashboard {...data} days={days} intelligence={intelligence} today={today} updatedAt={updatedAt} syncAt={syncAt} diary={diary}
      nutrition={<>{diary&&<Suspense fallback={null}><NutritionSummary diary={diary} locale={locale}/></Suspense>}
        {credentialsConfigured()&&<section className="panel dashboard-nutrition"><div><h2>Coach</h2><p className="muted">Reflect on your recorded training week.</p></div><Link className="quiet" href="/app/coach">Open Coach</Link></section>}</>}/>:
    tab==='body'?<Body locale={locale} rows={raw.measurements}/>:
    tab==='goals'?<GoalView goals={raw.goals} workouts={goalWorkouts} rows={raw.measurements}/>:
    tab==='settings'?<SettingsView theme={theme} locale={locale} email={user.email} mfaEnabled={Boolean(mfa?.data?.totp.length)}/>:
    tab==='integrations'?<IntegrationView syncAt={syncAt} lastError={raw.sync?.last_error} available={hevyStatus} canConfigure={credentialsConfigured()}/>:
    <TrainingView data={data} tab={tab} slug={slug} days={days} q={query.q} formula={query.formula}/>}
  </Shell>;
}
