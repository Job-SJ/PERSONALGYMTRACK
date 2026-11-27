import {Dumbbell} from 'lucide-react';
import {login} from '../actions';
import {configured,publicRegistration} from '../../lib/supabase';
import Link from 'next/link';
export default async function Login({searchParams}:{searchParams:Promise<{status?:string}>}){
  const {status}=await searchParams;
  return <main className="auth"><div className="auth-box"><Dumbbell size={30}/><p className="eyebrow">PERSONALGYMTRACK</p><h1>Welcome back.</h1><p>Access your private training workspace.</p>{!configured()?<p>Configure Supabase locally to enable sign-in. <Link href="/">View the setup dashboard</Link></p>:<form action={login} className="form"><label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{status==='failed'&&<p role="alert">Sign-in could not be completed.</p>}<button className="button">Sign in</button><small>{publicRegistration()?<Link href="/register">Create account</Link>:'Access is by invitation.'} ? <Link href="/reset">Reset password</Link></small></form>}</div></main>;
}
