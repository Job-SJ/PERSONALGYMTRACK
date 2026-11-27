'use client';

import {useEffect,useState} from 'react';

export function AppWorker(){
  const [update,setUpdate]=useState<ServiceWorker>();
  useEffect(()=>{
    if(process.env.NODE_ENV!=='production' || !('serviceWorker' in navigator)) return;
    const workers=navigator.serviceWorker;
    let registration:ServiceWorkerRegistration|undefined;
    let installing:ServiceWorker|null=null;
    let cancelled=false;
    let controlled=Boolean(workers.controller);
    function stateChanged(){
      if(installing?.state==='installed' && controlled) setUpdate(installing);
    }
    function found(){
      installing?.removeEventListener('statechange',stateChanged);
      installing=registration?.installing??null;
      installing?.addEventListener('statechange',stateChanged);
    }
    function controllerChanged(){
      if(controlled) window.location.reload();
      controlled=true;
    }
    workers.addEventListener('controllerchange',controllerChanged);
    void workers.register('/sw.js',{updateViaCache:'none'}).then(result=>{
      if(cancelled) return;
      registration=result;
      if(controlled && result.waiting) setUpdate(result.waiting);
      registration.addEventListener('updatefound',found);
      found();
    }).catch(()=>undefined);
    return ()=>{
      cancelled=true;
      registration?.removeEventListener('updatefound',found);
      installing?.removeEventListener('statechange',stateChanged);
      workers.removeEventListener('controllerchange',controllerChanged);
    };
  },[]);
  return update && <div className="app-update" role="status">
    <button className="button" onClick={()=>update.postMessage('apply-update')}>Reload to update GymTrack</button>
  </div>;
}
