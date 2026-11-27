self.addEventListener('message',event=>{
  if(event.data==='apply-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.mode!=='navigate' || request.method!=='GET' || new URL(request.url).origin!==self.location.origin) return;
  event.respondWith(fetch(request).catch(()=>new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline · PERSONALGYMTRACK</title><main><h1>You are offline</h1><p>Reconnect to access your workspace.</p><a href="/app">Try again</a></main></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}},
  )));
});
