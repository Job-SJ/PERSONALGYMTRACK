import {NextResponse,type NextRequest} from 'next/server';
import {configured,db} from '../../../lib/supabase';
export async function GET(request:NextRequest) {
  const token_hash=request.nextUrl.searchParams.get('token_hash');
  const type=request.nextUrl.searchParams.get('type');
  if (configured() && token_hash && (type==='invite'||type==='recovery'||type==='email')) {
    const {error}=await (await db()).auth.verifyOtp({type,token_hash});
    if (!error) return NextResponse.redirect(new URL('/app/settings',request.url));
  }
  return NextResponse.redirect(new URL('/login?status=failed',request.url));
}
