import 'server-only';
import {createHash} from 'node:crypto';
import {sendNotification} from 'web-push';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {bestRecords,shiftDay,weekKey} from './analytics';
import {adaptiveMaintenance} from './adaptive-nutrition';
import {dailyIntelligence} from './daily-intelligence';
import {portionSchema,type Entry} from './nutrition';
import type {Measurement,Template,Workout} from './model';
import {categories,coachingEvents,defaultNotifications,notificationClock,notificationPreferences,type Category,type NotificationPreferences} from './notification-rules';
import {registrationSchema} from './push-subscription';

export const notificationCommand=z.discriminatedUnion('action',[
  z.object({action:z.literal('preferences'),preferences:notificationPreferences}),
  z.object({action:z.literal('read'),id:z.uuid().optional()}),
  z.object({action:z.enum(['register','unregister']),device:registrationSchema}),
]);

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const vapid=()=>process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT?{
  publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY,subject:process.env.VAPID_SUBJECT,
}:null;
function verify<T>(result:{data:T;error:unknown}){
  if(result.error) throw new Error('Notification storage is unavailable.');
  return result.data;
}
function normalize(row:NotificationPreferences){
  return notificationPreferences.parse({...row,reminder_time:row.reminder_time.slice(0,5),quiet_start:row.quiet_start.slice(0,5),quiet_end:row.quiet_end.slice(0,5)});
}

export async function notificationState(admin:SupabaseClient,user:string){
  const [prefs,history]=await Promise.all([
    admin.from('notification_preferences').select('timezone,reminder_time,quiet_start,quiet_end,categories,detailed').eq('user_id',user).maybeSingle(),
    admin.from('notifications').select('id,category,created_at,read_at').eq('user_id',user).order('created_at',{ascending:false}).limit(60),
  ]);
  const row=verify(prefs);
  return {preferences:row?normalize(row):defaultNotifications,history:verify(history)??[],vapidPublicKey:vapid()?.publicKey??null};
}

export async function changeNotifications(admin:SupabaseClient,user:string,command:z.infer<typeof notificationCommand>){
  if(command.action==='preferences'){
    verify(await admin.from('notification_preferences').upsert({user_id:user,...command.preferences,checked_at:null}));
  }else if(command.action==='read'){
    const query=admin.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',user).is('read_at',null);
    verify(await (command.id?query.eq('id',command.id):query));
  }else{
    const {device}=command;
    const fingerprint=digest(device.channel==='web'?device.subscription.endpoint:device.subscription.token);
    if(command.action==='unregister') verify(await admin.from('push_registrations').delete().eq('user_id',user).eq('fingerprint',fingerprint));
    else verify(await admin.rpc('register_notification_device',{owner_id:user,device_channel:device.channel,
      device_fingerprint:fingerprint,device_subscription:device.subscription}));
  }
  return {ok:true};
}

async function signals(admin:SupabaseClient,user:string,prefs:NotificationPreferences,day:string){
  const week=weekKey(day);
  const dayStart=shiftDay(day,-60);
  const wants=(...groups:Category[])=>groups.some(category=>prefs.categories.includes(category));
  const [complete,body,training,templates,diary,record]=await Promise.all([
    wants('nutrition','target')?admin.from('nutrition_days').select('day').eq('user_id',user).gte('day',shiftDay(day,-35)).lte('day',day).limit(36):null,
    wants('weight','target')?admin.from('body_measurements').select('day,kind,value').eq('user_id',user).eq('kind','weight')
      .gte('day',shiftDay(day,-35)).lte('day',day).limit(80):null,
    wants('weekly','strength')?admin.from('workouts').select('id,started_at,ended_at,workout_exercises(position,title,template_id,workout_sets(position,type,weight_kg,reps))')
      .eq('user_id',user).gte('started_at',dayStart).order('started_at',{ascending:false}).order('id').limit(180):null,
    wants('strength')?admin.from('exercise_templates').select('id,title,type,primary_muscle,secondary_muscles').eq('user_id',user).order('id').limit(1000):null,
    wants('target')?admin.from('nutrition_entries').select('day,portion').eq('user_id',user).gte('day',shiftDay(day,-35))
      .lt('day',day).order('day',{ascending:false}).order('id').limit(1000):null,
    wants('record')?admin.rpc('has_recent_weight_record',{owner_id:user,local_day:day,zone:prefs.timezone}):null,
  ]);
  if([complete,body,training,templates,diary,record].some(result=>result?.error)) throw new Error('Notification evidence is unavailable.');
  const zoneDay=(date:string)=>notificationClock(new Date(date),prefs.timezone).day;
  const workouts=((training?.data??[]) as Workout[]).filter(row=>zoneDay(row.started_at)<=day);
  const mapped=new Map(((templates?.data??[]) as Template[]).map(template=>[template.id,template]));
  const weights=(body?.data??[]) as Measurement[];
  const records=bestRecords(workouts,mapped);
  const report=wants('strength')?dailyIntelligence({workouts,templates:mapped,records,measurements:weights,today:day,days:30}):null;
  const completed=new Set((complete?.data??[]).map(row=>row.day));
  const portions=diary?.data??[];
  const rows=portions.flatMap(row=>{
    const parsed=portionSchema.safeParse(row.portion);
    if(!parsed.success){completed.delete(row.day);return [];}
    return [{day:row.day,portion:parsed.data} as Entry];
  });
  if(portions.length===1000) completed.delete(portions.at(-1)!.day);
  return {
    nutritionComplete:completed.has(day),
    weightMeasured:weights.some(row=>row.day>=week),
    weeklyTraining:workouts.some(row=>{const observed=zoneDay(row.started_at);return observed<week&&observed>=shiftDay(week,-7);}),
    newRecord:record?.data===true,
    strengthTrend:Boolean(report?.indicators[0]?.value.match(/^[+−-]/)),
    nutritionReview:Boolean(wants('target')&&adaptiveMaintenance(day,rows,[...completed],weights).estimate),
  };
}

async function deliver(admin:SupabaseClient,user:string,prefs:NotificationPreferences,category:Category){
  const push=vapid();
  const detail=categories[category];
  const title=prefs.detailed?detail.title:'PERSONALGYMTRACK';
  const body=prefs.detailed?detail.text:'You have a new update.';
  const url=prefs.detailed?detail.href:'/app/notifications';
  const devices=verify(await admin.from('push_registrations').select('id,channel,subscription,updated_at').eq('user_id',user).limit(8))??[];
  await Promise.allSettled(devices.map(async row=>{
    const parsed=registrationSchema.safeParse(row);
    if(!parsed.success) return;
    const device=parsed.data;
    let expired=false;
    if(device.channel==='web'&&push){
      try{
        await sendNotification(device.subscription,JSON.stringify({title,body,url}),{
          vapidDetails:push,TTL:600,urgency:'low',timeout:4500,topic:'pgt-update',
        });
      }catch(error){
        const status=(error as {statusCode?:number})?.statusCode;
        expired=status===404||status===410;
      }
    }else if(device.channel==='expo'&&process.env.EXPO_PUSH_ENABLED==='true'){
      const token=process.env.EXPO_PUSH_ACCESS_TOKEN;
      const response=await fetch('https://exp.host/--/api/v2/push/send',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(4500),
        headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
        body:JSON.stringify({to:device.subscription.token,title:'PERSONALGYMTRACK',body:'You have a new update.',
          data:{url:'/app/notifications'},channelId:'updates',ttl:600}),
      });
      if(response.ok){
        const ticket=await response.json();
        expired=ticket?.data?.details?.error==='DeviceNotRegistered';
      }
    }
    if(expired) verify(await admin.from('push_registrations').delete().eq('id',row.id).eq('user_id',user).eq('updated_at',row.updated_at));
  }));
}

export async function runNotifications(admin:SupabaseClient,now=new Date()){
  const accounts=verify(await admin.rpc('claim_notification_accounts',{batch_size:24})) as (NotificationPreferences&{user_id:string})[];
  let created=0;
  let errors=0;
  for(let index=0;index<accounts.length;index+=6){
    const results=await Promise.allSettled(accounts.slice(index,index+6).map(async account=>{
      const prefs=normalize(account);
      const {day}=notificationClock(now,prefs.timezone);
      const candidates=coachingEvents(now,prefs,{nutritionComplete:false,weightMeasured:false,weeklyTraining:true,newRecord:true,strengthTrend:true,nutritionReview:true});
      if(!candidates.length) return 0;
      const user=account.user_id;
      const events=coachingEvents(now,prefs,await signals(admin,user,prefs,day));
      if(!events.length) return 0;
      const latest=verify(await admin.from('notification_preferences').select('timezone,reminder_time,quiet_start,quiet_end,categories,detailed')
        .eq('user_id',user).maybeSingle());
      if(!latest) return 0;
      const current=normalize(latest);
      if(current.timezone!==prefs.timezone||current.reminder_time!==prefs.reminder_time||
        current.quiet_start!==prefs.quiet_start||current.quiet_end!==prefs.quiet_end) return 0;
      const allowed=events.filter(event=>current.categories.includes(event.category));
      if(!allowed.length) return 0;
      const inserted=verify(await admin.from('notifications').upsert(allowed.map(event=>({...event,user_id:user})),
        {onConflict:'user_id,category,period',ignoreDuplicates:true}).select('category'))??[];
      if(inserted.length&&verify(await admin.rpc('reserve_notification_push',{owner_id:user,local_day:day}))===true){
        await deliver(admin,user,current,inserted[0].category as Category);
      }
      return inserted.length;
    }));
    for(const result of results) if(result.status==='fulfilled') created+=result.value;else errors++;
  }
  return {accounts:accounts.length,created,errors};
}
