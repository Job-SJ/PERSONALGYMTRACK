import {cookies} from 'next/headers';
import {localeCookie,resolveLocale} from '../../../lib/format';
import {notFound} from 'next/navigation';
import {session} from '../../../lib/supabase';
import {dataFor} from '../../../lib/data';
import {Shell} from '../../../components/shell';
import {Body,Dashboard,GoalView,IntegrationView,SettingsView,TrainingView,rangeValue} from '../../../components/views';

export const maxDuration=120;
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{days?:string;q?:string;formula?:string;status?:string}>}){
  const {client,user}=await session();
  const [{segments=[]},query]=await Promise.all([params,searchParams]);
  const [tab='',slug]=segments;
  if (segments.length>2 || !['','workouts','calendar','analytics','exercises','muscles','records','body','goals','wrapped','integrations','settings'].includes(tab) || (slug&&!['exercises','muscles','workouts'].includes(tab))) notFound();
  const raw=await dataFor(client);
  const locale=resolveLocale((await cookies()).get(localeCookie)?.value);
  const data={...raw,locale,templates:new Map(raw.templates.map(t=>[t.id,t]))};
  const days=rangeValue(query.days);
  const syncAt=raw.sync?.cursor_at??null;
  const theme=raw.prefs?.theme??'dark';
  const mfa=tab==='settings' ? await client.auth.mfa.listFactors() : null;
  return <Shell theme={theme}>{query.status&&<div className="notice" role="status">{query.status.slice(0,200)}</div>}
    {tab===''?<Dashboard {...data} days={days} syncAt={syncAt}/>:
    tab==='body'?<Body locale={locale} rows={raw.measurements}/>:
    tab==='goals'?<GoalView goals={raw.goals} workouts={raw.workouts} rows={raw.measurements}/>:
    tab==='settings'?<SettingsView theme={theme} locale={locale} email={user.email} mfaEnabled={Boolean(mfa?.data?.totp.length)}/>:
    tab==='integrations'?<IntegrationView syncAt={syncAt} lastError={raw.sync?.last_error} available={Boolean(process.env.HEVY_API_KEY)&&user.id===process.env.HEVY_OWNER_ID}/>:
    <TrainingView data={data} tab={tab} slug={slug} days={days} q={query.q} formula={query.formula}/>}
  </Shell>;
}
