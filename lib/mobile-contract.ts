import type {Topic} from './coach-topics';
import type {Entry,Food,Target} from './nutrition';

export type MobileTab='Today'|'Nutrition'|'Training'|'Progress'|'Coach'|'Settings';
export type MobileWorkout={id:string;title:string;day:string;sets:number;volume:number|null;minutes:number};
export type MobileOverview={
  today:string;workouts:MobileWorkout[];weight:{day:string;value:number}[];headlines:{label:string;value:string}[];
  summary:string;entries:Entry[];target:Target|null;complete:boolean;theme:string;hevyConnected:boolean;
};
export type MobileCoach={setting:{enabled:boolean}|null;history:{id:string;topic:Topic;answer:string;created_at:string}[]};
export type FoodResults={foods:Food[]};
