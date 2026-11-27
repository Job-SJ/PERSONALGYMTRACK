import Link from 'next/link';
import {redirect} from 'next/navigation';
import {register} from '../actions';
import {publicRegistration} from '../../lib/supabase';

export default async function Register({searchParams}:{searchParams:Promise<{status?:string}>}){
  if(!publicRegistration()) redirect('/login');
  const {status}=await searchParams;
  return <main className="auth"><div className="auth-box">
    <p className="eyebrow">PERSONALGYMTRACK</p><h1>Create your account</h1>
    {status==='check-email'?<p role="status">Check your inbox for a confirmation link, or sign in if you already have an account.</p>:
      <form className="form" action={register}>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72}/></label>
        {status==='invalid'&&<p role="alert">Enter a valid email and a password of 12 to 72 characters.</p>}
        <button className="button">Create account</button>
      </form>}
    <Link href="/login">Sign in</Link>
  </div></main>;
}
