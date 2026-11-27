import {z} from 'zod';
import {shiftDay,weekKey} from './analytics';

export const categories={
  nutrition:{title:'Nutrition diary check-in',text:'Review your diary when it suits you.',href:'/app/nutrition'},
  weight:{title:'Bodyweight check-in',text:'Your optional weekly measurement reminder.',href:'/app/body'},
  weekly:{title:'Weekly training review',text:'Your recorded sessions are ready to explore.',href:'/app/calendar'},
  record:{title:'A training best was recorded',text:'Review your recorded lifts.',href:'/app/records'},
  strength:{title:'Strength trend available',text:'You have comparable sessions to review.',href:'/app/analytics?view=replay'},
  target:{title:'Nutrition target review',text:'You have enough logged data to review your estimate.',href:'/app/nutrition'},
} as const;
export const categorySchema=z.enum(Object.keys(categories) as [keyof typeof categories,...(keyof typeof categories)[]]);
export type Category=z.infer<typeof categorySchema>;
const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone=z.string().min(1).max(80).refine(value=>{
  try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
},'Choose a valid time zone.');
export const notificationPreferences=z.object({
  timezone,reminder_time:time,quiet_start:time,quiet_end:time,
  categories:z.array(categorySchema).max(6).transform(values=>[...new Set(values)]),
  detailed:z.boolean(),
});
export type NotificationPreferences=z.infer<typeof notificationPreferences>;
export const defaultNotifications:NotificationPreferences={
  timezone:'Europe/Amsterdam',reminder_time:'19:00',quiet_start:'22:00',quiet_end:'08:00',categories:[],detailed:false,
};
export function quietHours(clock:string,start:string,end:string){
  return start===end?false:start<end ? clock>=start&&clock<end : clock>=start||clock<end;
}
export function notificationClock(now:Date,zone:string){
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const parts=Object.fromEntries(format.formatToParts(now).map(part=>[part.type,part.value]));
  return {day:[parts.year,parts.month,parts.day].join('-'),clock:parts.hour+':'+parts.minute};
}
type Signals={nutritionComplete:boolean;weightMeasured:boolean;weeklyTraining:boolean;newRecord:boolean;strengthTrend:boolean;nutritionReview:boolean};
export function coachingEvents(now:Date,prefs:NotificationPreferences,signals:Signals){
  const {day,clock}=notificationClock(now,prefs.timezone);
  if(clock<prefs.reminder_time.slice(0,5)||quietHours(clock,prefs.quiet_start.slice(0,5),prefs.quiet_end.slice(0,5))) return [];
  const week=weekKey(day);
  const events:Record<Category,{ready:boolean;period:string}>={
    nutrition:{ready:!signals.nutritionComplete,period:day},
    weight:{ready:!signals.weightMeasured,period:week},
    weekly:{ready:signals.weeklyTraining,period:shiftDay(week,-7)},
    record:{ready:signals.newRecord,period:day},
    strength:{ready:signals.strengthTrend,period:week},
    target:{ready:signals.nutritionReview,period:week},
  };
  return prefs.categories.flatMap(category=>events[category].ready?[{category,period:events[category].period}]:[]);
}
