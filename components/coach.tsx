'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {reserveMicros,type CoachDiscovery,type CoachModel} from '../lib/coach-provider';
import {topics,type Topic} from '../lib/coach-topics';
import {chatConsent} from '../lib/coach-chat';
import {CoachChat,CoachMarkdown} from './coach-chat';

type Reply={id:string;created_at:string;topic:Topic;answer:string};
type Status={personal:boolean;instance:boolean;setting:{enabled:boolean;chatConsent:boolean;model:string;credential_source:'personal'|'instance';monthly_micros:number}|null;
  history:Reply[];usage:{requests:number;usd:number;tokens:number}};
const money=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(value);

async function coachRequest<T>(signal:AbortSignal,payload?:object):Promise<T>{
  const response=await fetch('/api/coach',{signal,cache:'no-store',...(payload?{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
  }:{})});
  const json=await response.json();
  if(!response.ok) throw new Error(json.error??'Coach is unavailable.');
  return json;
}

export function Coach(){
  const [status,setStatus]=useState<Status>();
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [chatVersion,setChatVersion]=useState(0);
  const [setup,setSetup]=useState(false);
  const [source,setSource]=useState<'personal'|'instance'>('personal');
  const [models,setModels]=useState<CoachModel[]>([]);
  const [modelIndex,setModelIndex]=useState(0);
  const [budget,setBudget]=useState('0');
  const [clearing,setClearing]=useState(false);
  const controller=useRef<AbortController|null>(null);
  const formKey=useRef<HTMLInputElement>(null);
  const model=models[modelIndex];
  const recommended=models.findIndex(row=>reserveMicros(row)<=Number(budget)*1_000_000);

  useEffect(()=>{
    const operation=new AbortController();
    void coachRequest<Status>(operation.signal).then(result=>{
      setStatus(result);
      setSource(result.setting?.credential_source??'personal');
      setBudget(String((result.setting?.monthly_micros??0)/1_000_000));
    }).catch(error=>{if(!operation.signal.aborted) setError(error.message);})
      .finally(()=>{if(!operation.signal.aborted) setLoading(false);});
    return ()=>{operation.abort();controller.current?.abort();};
  },[]);

  async function run(operation:(signal:AbortSignal)=>Promise<void>){
    if(controller.current) return;
    const active=new AbortController();
    controller.current=active;
    setBusy(true);setError('');setMessage('');
    try{await operation(active.signal);}
    catch(error){setError(active.signal.aborted?'Request cancelled.':error instanceof Error?error.message:'Coach is unavailable.');}
    finally{controller.current=null;setBusy(false);}
  }
  async function refresh(signal:AbortSignal){setStatus(await coachRequest<Status>(signal));}
  function discover(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const key=formKey.current?.value.trim();
    if(formKey.current) formKey.current.value='';
    void run(async signal=>{
      const result=await coachRequest<CoachDiscovery>(signal,{action:'discover',source,...(key?{key}:{})});
      setModels(result.models);setModelIndex(0);
      await refresh(signal);
      setMessage(result.diagnostic?`Connection verified. ${result.diagnostic}`:'Connection verified. Choose a model below.');
    });
  }
  function enable(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    if(!model) return;
    void run(async signal=>{
      const consent=form.get('consent')==='on';
      await coachRequest(signal,{action:'enable',source,selection:model,monthlyUsd:Number(budget),consent,chatConsent:consent});
      await refresh(signal);setSetup(false);setModels([]);setMessage('Coach is ready.');
    });
  }
  function action(name:string,confirmation:string){
    void run(async signal=>{
      await coachRequest(signal,{action:name});
      await refresh(signal);setClearing(false);
      if(name==='remove'){setModels([]);setModelIndex(0);}
      if(name==='delete-history') setChatVersion(value=>value+1);
      setMessage(confirmation);
    });
  }
  return <div className="coach-workspace">
    <div className="heading"><h1>Coach</h1>
      {status&&<button className="quiet" disabled={busy} onClick={()=>{
        setSetup(!setup);
        if(!setup) void run(refresh);
      }} aria-expanded={setup}>Coach settings</button>}
    </div>
    {loading&&<p role="status">Loading Coach…</p>}
    {error&&<p className="notice" role="alert">{error}</p>}
    {message&&<p className="notice" role="status">{message}</p>}
    {status&&setup&&<section className="panel coach-panel">
      <h2>Provider and budget</h2>
      {status.setting&&<p className="muted">{status.usage.requests} requests ? {money(status.usage.usd)} of {money(status.setting.monthly_micros/1_000_000)} this UTC month</p>}
      {status.setting?.enabled&&!status.setting.chatConsent&&<form className="form" onSubmit={event=>{
        event.preventDefault();void run(async signal=>{
          await coachRequest(signal,{action:'chat-consent',consent:true});
          await refresh(signal);setSetup(false);
        });
      }}><label className="coach-consent"><input type="checkbox" required/> {chatConsent}</label>
        <button className="button" disabled={busy}>Enable conversational chat</button></form>}
      <form className="form" onSubmit={discover}>
        {status.instance&&<label>Connection<select value={source} disabled={busy} onChange={event=>{setSource(event.target.value as typeof source);setModels([]);}}>
          <option value="personal">My OpenRouter key</option><option value="instance">Instance key</option>
        </select></label>}
        {source==='personal'&&<label>{status.personal?'Replacement key (optional)':'OpenRouter API key'}
          <input ref={formKey} type="password" autoComplete="off" maxLength={512} required={!status.personal}/>
        </label>}
        <button className="button secondary" disabled={busy}>Test connection and find models</button>
        <div className="inline coach-links"><a href="https://openrouter.ai/settings/keys">OpenRouter keys</a>
          <a href="https://openrouter.ai/settings/privacy">Privacy settings</a>
          <a href="https://openrouter.ai/docs/guides/privacy/zdr">Retention options</a></div>
      </form>
      {model&&<form className="form coach-model" onSubmit={enable}>
        <label>Model and provider<select value={modelIndex} onChange={event=>setModelIndex(Number(event.target.value))}>
          {models.map((row,index)=><option value={index} key={row.model+'|'+row.endpoint}>{row.name} · {row.provider} · {row.free?'Free':'Paid'}{index===recommended?' · Recommended':''}</option>)}
        </select></label>
        <p>{model.free?'Free model':`${money(model.prompt*1_000_000)} input / ${money(model.completion*1_000_000)} output per million tokens`} · Zero Data Retention routing required.</p>
        <details><summary>Supported parameters</summary><p>{model.capabilities.join(', ')}</p></details>
        <label>Monthly budget (USD)<input type="number" min="0" max="50" step="0.01" value={budget} onChange={event=>setBudget(event.target.value)} required/></label>
        <label className="coach-consent"><input type="checkbox" name="consent" required/> {chatConsent}</label>
        <button className="button" disabled={busy}>Save and enable Coach</button>
      </form>}
      <div className="inline coach-actions">
        {status.setting?.enabled&&<button className="quiet" disabled={busy} onClick={()=>action('disable','Coach disabled and consent withdrawn.')}>Disable Coach</button>}
        {status.personal&&<><button className="quiet" disabled={busy} onClick={()=>action('remove','Personal key removed.')}>Remove personal key</button>
          <button className="quiet" disabled={busy} onClick={()=>action('rotate','Personal key re-encrypted.')}>Re-encrypt personal key</button></>}
        <button className="quiet" disabled={busy} aria-expanded={clearing} onClick={()=>setClearing(!clearing)}>Delete conversations</button>
        {clearing&&<button className="button secondary" disabled={busy} onClick={()=>action('delete-history','Stored conversations deleted. Billing totals retained.')}>Confirm deletion</button>}
      </div>
    </section>}
    {busy&&<div className="inline" role="status"><span>Updating settings?</span><button className="quiet" onClick={()=>controller.current?.abort()}>Cancel</button></div>}
    <CoachChat key={chatVersion} ready={Boolean(status?.setting?.enabled&&status.setting.chatConsent)} blocked={busy||loading}
      setup={()=>setSetup(true)}/>
    {status&&status.history.length>0&&<details className="panel coach-panel"><summary>Earlier Coach replies</summary>
      {status.history.map(reply=><article key={reply.id}><h2>{topics[reply.topic]}</h2><CoachMarkdown text={reply.answer}/></article>)}
    </details>}
  </div>;
}
