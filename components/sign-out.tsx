'use client';

import {useRef,useState} from 'react';
import {logout} from '../app/actions';

export function SignOut(){
  const [busy,setBusy]=useState(false);
  const ready=useRef(false);
  return <form action={logout} onSubmit={async event=>{
    if(ready.current) return;
    event.preventDefault();
    if(busy) return;
    const form=event.currentTarget;
    setBusy(true);
    try{await (await import('./notifications')).clearDeviceNotifications();}
    catch{/* Local browser subscription may already be gone. */}
    ready.current=true;
    form.requestSubmit();
  }}><button className="quiet" aria-disabled={busy}>Sign out</button></form>;
}
