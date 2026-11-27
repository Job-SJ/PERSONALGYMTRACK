'use client';

import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {categories,type Category,type NotificationPreferences} from '../lib/notification-rules';

type Inbox={preferences:NotificationPreferences;history:{id:string;category:Category;created_at:string;read_at:string|null}[];vapidPublicKey:string|null};
type Device={channel:'web';subscription:PushSubscriptionJSON};
async function notificationRequest<T>(command?:object,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api/notifications',{signal,cache:'no-store',...(command?{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),
  }:{})});
  const body=await response.json();
  if(!response.ok) throw new Error(body.error??'Notifications are unavailable.');
  return body;
}

function pushKey(key:string){
  const encoded=key.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')),value=>value.charCodeAt(0));
}
const webDevice=(subscription:PushSubscription):Device=>({channel:'web',subscription:subscription.toJSON()});
export async function clearDeviceNotifications(){
  if(!('serviceWorker' in navigator)) return;
  const registration=await navigator.serviceWorker.getRegistration();
  const subscription=await registration?.pushManager?.getSubscription();
  if(!subscription) return;
  for(const notice of await registration?.getNotifications()??[]) notice.close();
  try{await notificationRequest({action:'unregister',device:webDevice(subscription)},AbortSignal.timeout(2500));}
  finally{await subscription.unsubscribe();}
}

export function Notifications(){
  const [inbox,setInbox]=useState<Inbox>();
  const [active,setActive]=useState<boolean>();
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const locked=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    void notificationRequest<Inbox>(undefined,controller.signal).then(setInbox).catch(error=>{
      if(!controller.signal.aborted) setError(error.message);
    });
    if('serviceWorker' in navigator&&'PushManager' in window){
      void navigator.serviceWorker.getRegistration().then(async registration=>{
        if(!controller.signal.aborted) setActive(Boolean(await registration?.pushManager.getSubscription()));
      }).catch(()=>undefined);
    }
    return ()=>controller.abort();
  },[]);
  async function mutate(fn:()=>Promise<void>,confirmation:string){
    if(locked.current) return;
    locked.current=true;setBusy(true);setError('');setNotice('');
    try{await fn();setInbox(await notificationRequest<Inbox>());setNotice(confirmation);}
    catch(error){setError(error instanceof Error?error.message:'The request could not be completed.');}
    finally{locked.current=false;setBusy(false);}
  }
  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    void mutate(()=>notificationRequest({action:'preferences',preferences:{
      timezone:form.get('timezone'),reminder_time:form.get('reminder'),quiet_start:form.get('quietStart'),
      quiet_end:form.get('quietEnd'),categories:form.getAll('category'),detailed:form.has('detailed'),
    }}),'Notification preferences saved.');
  }
  async function subscribe(){
    if(!inbox?.vapidPublicKey||!('serviceWorker' in navigator)||!('PushManager' in window)) throw new Error('Web Push is unavailable on this device.');
    const registration=await navigator.serviceWorker.getRegistration();
    if(!registration?.active) throw new Error('Reload the installed app to finish enabling Web Push.');
    if(await Notification.requestPermission()!=='granted') throw new Error('Allow notifications in your device settings.');
    const existing=await registration.pushManager.getSubscription();
    const subscription=existing??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKey(inbox.vapidPublicKey)});
    try{await notificationRequest({action:'register',device:webDevice(subscription)});setActive(true);}
    catch(error){if(!existing) await subscription.unsubscribe();throw error;}
  }
  const preferences=inbox?.preferences;
  const unread=inbox?.history.filter(row=>!row.read_at).length??0;
  return <div className="coach-workspace">
    <div className="heading"><div><h1>Notifications</h1><p>Check-ins and training updates at your pace.</p></div></div>
    {error&&<p className="notice" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
    {!inbox&&!error&&<p role="status">Loading notifications…</p>}
    {inbox&&<section className="panel coach-panel">
      <div className="inline"><h2>Updates</h2>{unread>0&&<button className="quiet" disabled={busy} onClick={()=>void mutate(()=>notificationRequest({action:'read'}),'All updates marked read.')}>Mark all read</button>}</div>
      {!inbox.history.length&&<p className="muted">No updates yet.</p>}
      <ul className="notification-list">{inbox.history.map(row=><li key={row.id}>
        <div><Link href={categories[row.category].href}>{categories[row.category].title}</Link>
          {!row.read_at&&<span className="muted"> · Unread</span>}
          <p className="muted">{categories[row.category].text} <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString()}</time></p></div>
        {!row.read_at&&<button className="quiet" disabled={busy} onClick={()=>void mutate(()=>notificationRequest({action:'read',id:row.id}),'Update marked read.')}>Mark read</button>}
      </li>)}</ul>
    </section>}
    {preferences&&<section className="panel coach-panel">
      <h2>Notification preferences</h2>
      <form className="form" onSubmit={save}>
        <fieldset className="notification-options"><legend>Send me</legend>{Object.entries(categories).map(([value,category])=>
          <label className="coach-consent" key={value}><input type="checkbox" name="category" value={value} defaultChecked={preferences.categories.includes(value as Category)}/> {category.title}</label>)}</fieldset>
        <div className="nut-form-grid">
          <label>Time zone<input name="timezone" defaultValue={preferences.timezone} required maxLength={80} list="notification-timezones"/></label>
          <datalist id="notification-timezones">{Intl.supportedValuesOf('timeZone').map(zone=><option key={zone} value={zone}/>)}</datalist>
          <label>Preferred time<input name="reminder" type="time" defaultValue={preferences.reminder_time} required/></label>
          <label>Quiet hours start<input name="quietStart" type="time" defaultValue={preferences.quiet_start} required/></label>
          <label>Quiet hours end<input name="quietEnd" type="time" defaultValue={preferences.quiet_end} required/></label>
        </div>
        <label className="coach-consent"><input type="checkbox" name="detailed" defaultChecked={preferences.detailed}/> Show detailed previews on Web Push devices</label>
        <button className="button" disabled={busy}>Save preferences</button>
      </form>
      {inbox?.vapidPublicKey&&active!==undefined&&<div className="inline coach-actions">
        <button className="quiet" disabled={busy} onClick={()=>void mutate(active?async()=>{await clearDeviceNotifications();setActive(false);}:subscribe,active?'Push disabled on this device.':'Push enabled on this device.')}>
          {active?'Disable push on this device':'Enable push on this device'}
        </button>
      </div>}
    </section>}
  </div>;
}
