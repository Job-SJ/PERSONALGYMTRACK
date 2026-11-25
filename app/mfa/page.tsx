import {verifyMfa,logout} from '../actions';
export default async function Mfa({searchParams}:{searchParams:Promise<{status?:string}>}){
  const {status}=await searchParams;
  return <main className="auth"><div className="auth-box"><p className="eyebrow">PERSONALGYMTRACK</p><h1>Verify your sign-in</h1><form action={verifyMfa} className="form"><label>Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required/></label>{status&&<p role="alert">Verification could not be completed.</p>}<button className="button">Verify</button></form><form action={logout}><button className="quiet">Sign out</button></form></div></main>;
}
