'use client';
import {useActionState} from 'react';
import {enrollMfa,confirmMfa} from '../app/actions';
export function MfaEnrollment({enabled}:{enabled:boolean}) {
  const [state,action,busy]=useActionState(enrollMfa,null);
  if (enabled) return <p className="muted">Authenticator verification is enabled.</p>;
  if(state?.secret) return <form className="form" action={confirmMfa}>
    <p>Add this setup key to your authenticator app, then enter the current code.</p>
    <code className="secret-code">{state.secret}</code>
    <input type="hidden" name="factor" value={state.id}/>
    <label>Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required/></label>
    <button className="button">Verify and enable</button>
  </form>;
  return <form className="form" action={action}><button className="button secondary" disabled={busy}>Set up authenticator</button>{state?.error&&<p role="alert">{state.error}</p>}</form>;
}
