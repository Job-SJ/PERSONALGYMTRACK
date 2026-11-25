export function publicSupabase(url?:string,key?:string) {
  if (!url || !key) return null;
  try {
    const endpoint=new URL(url);
    const local=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
    if (endpoint.pathname!=='/' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    if (endpoint.protocol!=='https:' && !(local && endpoint.protocol==='http:')) return null;
    const legacy=key.split('.');
    const anonJwt=legacy.length===3 && JSON.parse(Buffer.from(legacy[1],'base64url').toString()).role==='anon';
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anonJwt) return null;
    return {url:endpoint.origin,key};
  } catch {
    return null;
  }
}

const urlVariable = 'NEXT_PUBLIC_SUPABASE_URL';
const keyVariable = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

export function configuredSupabase(env = process.env) {
  // Both callers run on the server. Read the environment at request time so
  // credentials configured after a production build are picked up on restart.
  return publicSupabase(env[urlVariable], env[keyVariable]);
}
