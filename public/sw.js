self.addEventListener('message',event=>{
  if(event.data==='apply-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data;
  try{data=event.data?.json();}catch{return;}
  const url=typeof data?.url==='string'&&/^\/app\/(?:notifications|nutrition|body|coach|records|calendar|analytics)(?:\?view=replay)?$/.test(data.url)?data.url:'/app/notifications';
  const title=typeof data?.title==='string'?data.title.slice(0,100):'PERSONALGYMTRACK';
  const body=typeof data?.body==='string'?data.body.slice(0,140):'You have a new update.';
  event.waitUntil(self.registration.showNotification(title,{body,icon:'/app-icon-192.png',tag:'pgt-update',data:{url}}));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const path=event.notification.data?.url;
  if(typeof path!=='string'||!path.startsWith('/app/')) return;
  event.waitUntil(self.clients.openWindow(new URL(path,self.location.origin).href));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.mode!=='navigate' || request.method!=='GET' || new URL(request.url).origin!==self.location.origin) return;
  event.respondWith(fetch(request).catch(()=>new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline · PERSONALGYMTRACK</title><main><h1>You are offline</h1><p>Reconnect to access your workspace.</p><a href="/app">Try again</a></main></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}},
  )));
});
