'use client';
export default function ErrorPage({reset}:{reset:()=>void}){
  return <main className="auth"><div className="auth-box"><h1>Workspace unavailable</h1><p>Check the database setup or retry in a moment.</p><button className="button" onClick={reset}>Try again</button></div></main>;
}
