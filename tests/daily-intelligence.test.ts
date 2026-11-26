import {describe,expect,it} from 'vitest';
import {bestRecords,shiftDay} from '../lib/analytics';
import {dailyIntelligence,intelligencePeriod} from '../lib/daily-intelligence';
import {diaryCalories,type Entry} from '../lib/nutrition';
import type {Measurement,Template,Workout} from '../lib/model';

const today='2026-11-26';
const prior=[-59,-44,-31], recent=[-28,-15,-2];
const templates=new Map<string,Template>([
  ['bench',{id:'bench',title:'Bench press',type:'weight_reps',primary_muscle:'chest',secondary_muscles:[]}],
  ['row',{id:'row',title:'Barbell row',type:'weight_reps',primary_muscle:'back',secondary_muscles:[]}],
]);
function workout(offset:number,weight:number|null,template='bench',id=String(offset),reps=5):Workout {
  const day=shiftDay(today,offset);
  return {id,title:'Synthetic session',source:'hevy',started_at:day+'T12:00:00Z',ended_at:day+'T13:00:00Z',notes:null,
    workout_exercises:[{position:0,title:templates.get(template)?.title??'Unmapped',template_id:template,notes:null,
      workout_sets:[{position:0,type:'normal',reps,weight_kg:weight}]}]};
}
const train=(days:number[],loads:number[])=>days.map((day,i)=>workout(day,loads[i]));
const report=(workouts:Workout[],measurements:Measurement[]=[],nutrition:{day:string;value:number}[]=[])=>
  dailyIntelligence({workouts,templates,measurements,nutrition,records:bestRecords(workouts,templates),today,days:30});
const baseline=train(prior,[80,80,80]);

describe('Daily Intelligence',()=>{
  it('requires sustained estimated strength gains for the headline, then links the strongest evidence',()=>{
    const result=report([...baseline,...train(recent,[88,88,90])]);
    expect(result.headline).toBe('Estimated strength is rising.');
    expect(result.indicators[0]).toMatchObject({value:'+10%',tone:'positive'});
    expect(result.insights[0]).toMatchObject({key:'exercise:bench',href:'/app/workouts/-2#set-0-0'});
    expect(result.insights.filter(insight=>insight.key==='exercise:bench')).toHaveLength(1);
  });

  it('describes a repeated decline as a lower estimate without inferring fatigue',()=>{
    const result=report([...baseline,...train(recent,[73,74,74])]);
    expect(result.headline).toBe('Estimated strength has dipped.');
    expect(result.indicators[0].value).toBe('-7.5%');
    expect(result.insights).toContainEqual(expect.objectContaining({href:'/app/exercises/bench?days=30'}));
    expect(result.summary).not.toMatch(/recover|fatigue|injury/i);
  });

  it('distinguishes steady comparable estimates and a longer plateau',()=>{
    const result=report([...baseline,...train(recent,[80,81,80])]);
    expect(result.headline).toBe('Your estimated strength is holding steady.');
    expect(result.indicators[0].value).toBe('0%');
    expect(result.insights).toContainEqual(expect.objectContaining({title:'Bench press has levelled out.'}));
    const seven=dailyIntelligence({workouts:train([-13,-11,-9,-6,-4,-2],[80,80,80,80,81,80]),templates,measurements:[],records:[],today,days:7});
    expect(seven.headline).toBe(result.headline);
    expect(seven.insights.some(item=>item.title.includes('levelled out'))).toBe(false);
  });

  it('has an onboarding state and rejects a single exceptional session as a trend',()=>{
    const empty=report([]);
    expect(empty.headline).toBe('Build your training baseline.');
    expect(empty.summary).toMatch(/Import workouts/);
    expect(empty.insights).toHaveLength(0);
    expect(report([...baseline,workout(-1,96)]).indicators[0].value).toBe('—');
    const outlier=report([...baseline,...train(recent,[80,80,100])]);
    expect(outlier.headline).toBe('Your recent strength estimates are mixed.');
    expect(outlier.indicators[0].value).toBe('Mixed');
    expect(report([...baseline,...train([-28,-20,-12],[90,90,90])]).indicators[0].value).toBe('—');
  });

  it('keeps attendance available when load is unavailable and excludes today and future dates',()=>{
    const workouts=[-61,-59,-54,-42,-31,-8,-8,0,1].map((day,index)=>workout(day,null,'unmapped',String(index)));
    const result=report(workouts);
    expect(result.headline).toBe('You’ve recorded fewer training days.');
    expect(result.indicators[2]).toMatchObject({value:'1 / 30 days',detail:'Prior period: 4 training days'});
    expect(result.indicators.slice(0,2).map(metric=>metric.value)).toEqual(['—','—']);
    expect(result.insights).toHaveLength(0);
  });

  it('does not substitute zero for missing volume or use estimates outside the supported rep range',()=>{
    const workouts=[...prior,...recent].map((day,index)=>workout(day,index%3===0?80:null,'bench',String(index),12));
    expect(report(workouts).indicators.slice(0,2).map(metric=>metric.value)).toEqual(['—','—']);
    expect(intelligencePeriod('90')).toBe(90);
    expect(intelligencePeriod('365')).toBe(30);
  });

  it('uses only sufficiently complete calorie history and keeps intake observations descriptive',()=>{
    const nutrition=Array.from({length:60},(_,i)=>({day:shiftDay(today,i-60),value:i<30?2000:2300}));
    const result=report([],[],nutrition);
    expect(result.insights).toEqual([expect.objectContaining({key:'nutrition',href:'/app/nutrition'})]);
    expect(report([],[],nutrition.filter((_,i)=>i%4===0)).insights).toHaveLength(0);
  });

  it('limits ranked insights to three distinct topics with a relevant detail route',()=>{
    const weights=[...prior,...recent].map(day=>({day:shiftDay(today,day),kind:'weight',value:day<-30?80:84,source:'manual',id:String(day)}));
    const food=Array.from({length:60},(_,i)=>({day:shiftDay(today,i-60),value:i<30?2000:2300}));
    const row=[...prior,...recent].map(day=>workout(day,day<-30?70:64,'row','row'+day));
    const result=report([...baseline,...train(recent,[88,89,90]),...row],weights,food);
    expect(result.headline).toBe('Your recent strength estimates are mixed.');
    expect(result.insights).toHaveLength(3);
    expect(new Set(result.insights.map(item=>item.key)).size).toBe(3);
    expect(result.insights.every(item=>item.href.startsWith('/app/'))).toBe(true);
  });

  it('distinguishes a muscle distribution shift from an overall volume change',()=>{
    const sessions=[-60,-51,-40,-31,-28,-20,-12,-4].map(day=>{
      const set=(target:string,count:number)=>({
        ...workout(day,80,target).workout_exercises[0],
        workout_sets:Array.from({length:count},(_,position)=>({position,type:'normal' as const,weight_kg:80,reps:5})),
      });
      return {...workout(day,80),workout_exercises:[set('bench',day<-30?3:7),{...set('row',day<-30?7:3),position:1}]};
    });
    const result=report(sessions);
    expect(result.indicators[1].value).toBe('0%');
    expect(result.insights).toContainEqual(expect.objectContaining({key:'muscle',href:'/app/muscles/chest?days=30'}));
  });

  it('describes a relative strength change even when absolute estimates are steady',()=>{
    const weights=[...prior,...recent].map(day=>({day:shiftDay(today,day),kind:'weight',value:day<-30?84:80,source:'manual',id:String(day)}));
    const result=report([...baseline,...train(recent,[80,80,80])],weights);
    // The longer-period plateau is ranked above its related relative observation.
    expect(result.headline).toBe('Your estimated strength is holding steady.');
    const short=[-13,-11,-9,-6,-4,-2];
    const shortWeights=short.map(day=>({day:shiftDay(today,day),kind:'weight',value:day<-7?84:80,source:'manual',id:String(day)}));
    const seven=dailyIntelligence({workouts:train(short,short.map(()=>80)),templates,measurements:shortWeights,records:[],today,days:7});
    expect(seven.insights).toContainEqual(expect.objectContaining({title:'Bench press changed relative to bodyweight.'}));
  });
});

it('counts only completed days with known totals and keeps partial today totals separate',()=>{
  const entry=(offset:number,kcal:number|null):Pick<Entry,'day'|'portion'>=>({
    day:shiftDay(today,offset),
    portion:{amount:100,unit:'g',food:{name:'Synthetic oats',source:'Custom label',preparation:'As sold',basis:'g',values:{kcal}}},
  });
  const entries=[entry(-1,300),entry(-2,300),entry(-2,null),entry(-3,400),entry(0,300),entry(0,null)];
  const result=diaryCalories(entries,new Set([-1,-2].map(offset=>shiftDay(today,offset))),today);
  expect(result.trend).toEqual([{day:shiftDay(today,-1),value:300}]);
  expect(result.today).toEqual({value:300,incomplete:true});
});
