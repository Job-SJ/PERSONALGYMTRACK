import Link from 'next/link';
import {sendReset} from '../actions';
export default async function Reset({searchParams}:{searchParams:Promise<{sent?:string}>}){
  const {sent}=await searchParams;
  return <main className="auth"><div className="auth-box"><p className="eyebrow">PERSONALGYMTRACK</p><h1>Reset your password</h1>{sent?<p role="status">If the account is eligible, password reset instructions will be emailed.</p>:<form className="form" action={sendReset}><label>Email<input name="email" type="email" required autoComplete="email"/></label><button className="button">Send reset link</button></form>}<Link className="quiet" href="/login">Back to sign-in</Link></div></main>;
}
