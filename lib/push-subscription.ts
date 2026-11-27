import {z} from 'zod';

const endpoint=z.url().max(2048).refine(value=>{
  let url:URL;
  try{url=new URL(value);}catch{return false;}
  const host=url.hostname;
  const known=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||
    host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
  return known&&url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&!url.hash&&url.pathname.length>1;
});
const base64=z.string().regex(/^[A-Za-z0-9_-]+$/);
export const webPushSubscription=z.object({endpoint,keys:z.object({p256dh:base64.length(87),auth:base64.length(22)})});
export const expoToken=z.string().regex(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{16,100}\]$/);
export const registrationSchema=z.discriminatedUnion('channel',[
  z.object({channel:z.literal('web'),subscription:webPushSubscription}),
  z.object({channel:z.literal('expo'),subscription:z.object({token:expoToken})}),
]);
