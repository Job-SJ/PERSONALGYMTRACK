import {dayKey} from './analytics';

export type PartnerWorkout = {
  id:string; notes:string|null; started_at:string; ended_at:string;
};

// Remove email addresses before looking for tags. The sentence-ending dot
// after a handle is punctuation, while dots between username characters are kept.
const email=/(?<![@\p{L}\p{N}._+-])[\p{L}\p{N}!#$%&'*+=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+=?^_`{|}~-]+)*@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const tag=/(?<!@)@([\p{L}\p{N}_]+(?:\.+[\p{L}\p{N}_]+)*)/gu;

export function taggedUsernames(text:string){
  return new Set([...text.replace(email,' ').matchAll(tag)].map(match=>match[1].toLowerCase()));
}

export function discoverPartners(workouts:PartnerWorkout[]){
  const partners=new Map<string,string[]>();
  const duration={labelled:{count:0,total:0},unlabelled:{count:0,total:0}};
  for(const workout of workouts){
    const usernames=taggedUsernames(workout.notes??'');
    if(usernames.size){
      const day=dayKey(workout.started_at);
      for(const username of usernames){
        const dates=partners.get(username)??[];
        dates.push(day);
        partners.set(username,dates);
      }
    }
    const minutes=(Date.parse(workout.ended_at)-Date.parse(workout.started_at))/60000;
    if(minutes>0){
      const group=usernames.size?duration.labelled:duration.unlabelled;
      group.count++;
      group.total+=minutes;
    }
  }
  const summarize=({count,total}:{count:number;total:number})=>({count,mean:count?Math.round(total/count):null});
  return {
    partners:[...partners].map(([username,dates])=>{
      dates.sort().reverse();
      return {username,dates,count:dates.length,last:dates[0],percentage:dates.length/workouts.length*100};
    }).sort((a,b)=>b.count-a.count||a.username.localeCompare(b.username)),
    duration:{labelled:summarize(duration.labelled),unlabelled:summarize(duration.unlabelled)},
  };
}
