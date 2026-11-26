import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {configuredSupabase} from './lib/connection-env';
export async function proxy(request:NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const dev=process.env.NODE_ENV==='development';
  const productImages=request.nextUrl.pathname==='/app/nutrition'?' https://images.openfoodfacts.org':'';
  const csp="default-src 'self'; script-src 'self' 'nonce-"+nonce+"' 'strict-dynamic'"+(dev?" 'unsafe-eval'":"")+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:"+productImages+"; font-src 'self'; connect-src 'self'"+(dev?" ws:":"")+"; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
  const headers=new Headers(request.headers);
  headers.set('content-security-policy',csp);
  headers.set('x-nonce',nonce);
  let response=NextResponse.next({request:{headers}});
  const connection=configuredSupabase();
  if (connection) {
    const client=createServerClient(connection.url,connection.key,{cookieOptions:{httpOnly:true},cookies:{getAll:()=>request.cookies.getAll(),setAll:items=>{
      for (const {name,value} of items) request.cookies.set(name,value);
      headers.set('cookie',request.cookies.toString());
      response=NextResponse.next({request:{headers}});
      for (const {name,value,options} of items) response.cookies.set(name,value,options);
    }}});
    await client.auth.getClaims();
  }
  response.headers.set('Content-Security-Policy',csp);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
