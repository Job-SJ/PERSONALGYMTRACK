import {expect,it} from 'vitest';
import {coachingEvents,defaultNotifications,notificationClock,quietHours} from '../lib/notification-rules';
import {registrationSchema} from '../lib/push-subscription';

const signals={nutritionComplete:false,weightMeasured:false,weeklyTraining:true,newRecord:true,strengthTrend:true,nutritionReview:true};

it('uses the local day and handles daylight saving changes and overnight quiet hours',()=>{
  expect(notificationClock(new Date('2025-03-30T01:30:00Z'),'Europe/Amsterdam')).toEqual({day:'2025-03-30',clock:'03:30'});
  expect(quietHours('07:59','22:00','08:00')).toBe(true);
  expect(quietHours('08:00','22:00','08:00')).toBe(false);
  expect(quietHours('23:00','22:00','08:00')).toBe(true);
  expect(coachingEvents(new Date('2025-04-05T21:00:00Z'),{...defaultNotifications,categories:['nutrition']},signals)).toEqual([]);
});

it('opts out by default and uses stable daily and weekly duplicate keys',()=>{
  const now=new Date('2025-04-05T18:00:00Z');
  expect(coachingEvents(now,defaultNotifications,signals)).toEqual([]);
  const prefs={...defaultNotifications,categories:['nutrition','weekly','weight'] as const};
  const options={...prefs,categories:[...prefs.categories]};
  expect(coachingEvents(now,options,signals)).toEqual([
    {category:'nutrition',period:'2025-04-05'},{category:'weekly',period:'2025-03-24'},{category:'weight',period:'2025-03-31'},
  ]);
  expect(coachingEvents(now,options,{...signals,nutritionComplete:true,weightMeasured:true})).toEqual([{category:'weekly',period:'2025-03-24'}]);
});

it('accepts approved HTTPS push services only',()=>{
  const registration=(endpoint:string)=>({channel:'web',subscription:{endpoint,keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}});
  for(const url of ['http://fcm.googleapis.com/push','https://fcm.googleapis.com.example.invalid/push','https://127.0.0.1/push',
    'https://anonymous@fcm.googleapis.com/push','https://fcm.googleapis.com:8080/push','garbage']){
    expect(registrationSchema.safeParse(registration(url)).success).toBe(false);
  }
  expect(registrationSchema.safeParse(registration('https://fcm.googleapis.com/fcm/send/synthetic-endpoint')).success).toBe(true);
});
