import Link from 'next/link';
import {Activity,Dumbbell,Layers3,Shield} from 'lucide-react';
import {configured} from '../lib/supabase';
import {Body,Dashboard,GoalView,IntegrationView,SettingsView,TrainingView,rangeValue} from '../components/views';
import {Shell} from '../components/shell';
import {intelligencePeriod} from '../lib/daily-intelligence';
export default async function Home({searchParams}:{searchParams:Promise<{tab?:string;days?:string;muscle?:string;intelligence?:string}>}){
  if (!configured()) {
    const {tab,days,muscle,intelligence}=await searchParams;
    const data={workouts:[],templates:new Map(),measurements:[]};
    const range=rangeValue(days);
    return <Shell preview previewTab={tab==='dashboard'?'':tab}>{tab==='integrations'?<IntegrationView available={false} syncAt={null} preview/>:
    tab==='body'?<Body rows={[]} preview/>:tab==='goals'?<GoalView goals={[]} workouts={[]} rows={[]} preview/>:
    tab==='settings'?<SettingsView theme="dark" preview/>:
    tab && tab!=='dashboard'?<TrainingView data={data} tab={tab} slug={tab==='muscles'?muscle:undefined} days={range} preview/>:
    <Dashboard {...data} days={range} intelligence={intelligencePeriod(intelligence)} syncAt={null} preview/>}</Shell>;
  }
  return <main className="auth"><div className="auth-box"><Dumbbell size={33}/><p className="eyebrow">PERSONALGYMTRACK</p><h1>Understand your training.</h1><p>Explore the strength, volume and consistency behind your workouts.</p><div className="auth-features"><span><Activity/> Performance over time</span><span><Layers3/> Muscle-by-muscle analysis</span><span><Shield/> Private training data</span></div><Link className="button" href="/login">Sign in</Link></div></main>;
}
