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
