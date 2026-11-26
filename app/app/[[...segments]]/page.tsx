import {cookies} from 'next/headers';
import {localeCookie,resolveLocale} from '../../../lib/format';
import {notFound} from 'next/navigation';
import {session} from '../../../lib/supabase';
import {dataFor,read} from '../../../lib/data';
import type {Workout} from '../../../lib/model';
import {Shell} from '../../../components/shell';
import {Body,Dashboard,GoalView,IntegrationView,SettingsView,TrainingView,rangeValue} from '../../../components/views';

export const maxDuration=120;
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{days?:string;q?:string;formula?:string;status?:string}>}){
  const {client,user}=await session();
  const [{segments=[]},query]=await Promise.all([params,searchParams]);
  const [tab='',slug]=segments;
  if (segments.length>2 || !['','workouts','calendar','analytics','exercises','muscles','records','body','goals','wrapped','integrations','settings'].includes(tab) || (slug&&!['exercises','muscles','workouts'].includes(tab))) notFound();
  const training=!['body','goals','settings','integrations'].includes(tab);
  const [raw,goalWorkouts,mfa]=await Promise.all([
    dataFor(client,{workouts:training,templates:training,measurements:['','body','goals','analytics'].includes(tab)||(tab==='exercises'&&Boolean(slug)),goals:tab==='goals',sync:tab===''||tab==='integrations'}),
    tab==='goals'?read<Pick<Workout,'started_at'>>(client,'workouts','started_at','started_at','id'):[],
    tab==='settings'?client.auth.mfa.listFactors():null,
  ]);
  const locale=resolveLocale((await cookies()).get(localeCookie)?.value);
  const data={...raw,locale,templates:new Map(raw.templates.map(t=>[t.id,t]))};
  const days=rangeValue(query.days);
  const syncAt=raw.sync?.cursor_at??null;
  const theme=raw.prefs?.theme??'dark';
  return <Shell theme={theme}>{query.status&&<div className="notice" role="status">{query.status.slice(0,200)}</div>}
    {tab===''?<Dashboard {...data} days={days} syncAt={syncAt}/>:
    tab==='body'?<Body locale={locale} rows={raw.measurements}/>:
    tab==='goals'?<GoalView goals={raw.goals} workouts={goalWorkouts} rows={raw.measurements}/>:
    tab==='settings'?<SettingsView theme={theme} locale={locale} email={user.email} mfaEnabled={Boolean(mfa?.data?.totp.length)}/>:
    tab==='integrations'?<IntegrationView syncAt={syncAt} lastError={raw.sync?.last_error} available={Boolean(process.env.HEVY_API_KEY)&&user.id===process.env.HEVY_OWNER_ID}/>:
    <TrainingView data={data} tab={tab} slug={slug} days={days} q={query.q} formula={query.formula}/>}
  </Shell>;
}
