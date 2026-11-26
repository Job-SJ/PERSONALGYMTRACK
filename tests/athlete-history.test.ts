import {describe,expect,it,vi} from 'vitest';
import {shiftDay} from '../lib/analytics';
import {athleteArchetype,passportFacts,performanceReplay,replayWindows,trainingFingerprint,type HistoryInput} from '../lib/athlete-history';
import {passportContents,passportDefaults,passportDimensions,passportPng,safePassportText} from '../lib/passport';
import type {Measurement,Template,Workout} from '../lib/model';

const today='2026-11-26';
const day=(n:number)=>shiftDay(today,n);
const templates=new Map<string,Template>([
  ['bench',{id:'bench',title:'Bench press',type:'weight_reps',primary_muscle:'chest',secondary_muscles:[]}],
  ['row',{id:'row',title:'Barbell row',type:'weight_reps',primary_muscle:'back',secondary_muscles:[]}],
]);
function workout(offset:number,weight:number,id='bench',reps=5):Workout{
  return {id:'synthetic-'+id+'-'+offset,title:'Synthetic training',source:'hevy',started_at:day(offset)+'T12:00:00Z',ended_at:day(offset)+'T13:00:00Z',notes:null,
    workout_exercises:[{position:0,title:templates.get(id)?.title??id,template_id:id,notes:null,
      workout_sets:Array.from({length:4},(_,position)=>({position,type:'normal',weight_kg:weight,reps}))}]};
}
const weight=(offset:number,value:number):Measurement=>({id:'measurement-'+offset,day:day(offset),kind:'weight',value,source:'manual'});
const history=(workouts:Workout[],measurements:Measurement[]=[]):HistoryInput=>({workouts,measurements,templates,today,locale:'en-GB'});

describe('Performance Replay',()=>{
  it('compares the same exercise with distinct estimates and actual recorded loads and matches nearby bodyweight',()=>{
    const input=history([workout(-65,80),workout(-60,80),workout(-3,100),workout(-9,96),
      workout(-50,130,'row'),workout(-6,140,'row'),workout(1,999)],[weight(-62,78),weight(-4,80)]);
    const replay=performanceReplay(input,{length:'30',exercise:'bench'})!;
    expect(replay.selected?.id).toBe('bench');
    expect(replay.baseline.load).toBe(80);
    expect(replay.baseline.estimated).toBeCloseTo(93.33);
    expect(replay.recent.load).toBe(100);
    expect(replay.recent.relative).toBeCloseTo(1.458);
    expect(replay.baseline.relativeDates).toBe(1);
    expect(replay.recent.workouts).toBe(3);
    expect(replay.recent.volume).toBe(6720);
    expect(replay.series.find(item=>item.key==='estimated')?.points).toHaveLength(4);
    expect(replay.milestones.some(mark=>mark.title==='Recorded load record')).toBe(true);
    expect(replay.series.some(item=>item.key==='frequency')).toBe(true);
    expect(performanceReplay(input,{length:'30',exercise:'row'})?.recent.load).toBe(140);
  });

  it('bounds selected dates, separates equal windows, and keeps invalid dates out',()=>{
    const dates=replayWindows('2020-01-15','2021-04-10',30,'2021-04-10','2021-02-31');
    expect(dates.recent.to).toBe('2021-04-10');
    expect(dates.baseline.to).toBe(shiftDay(dates.recent.from,-1));
    expect(dates.baseline.from).toBe(shiftDay(dates.baseline.to,-29));
    expect(replayWindows('2021-04-01','2021-04-10',30).canCompare).toBe(false);
  });

  it('keeps missing estimates and relative data unavailable without producing fake milestones',()=>{
    expect(performanceReplay(history([]),{})).toBeNull();
    const replay=performanceReplay(history([workout(-2,80,'bench',15)]),{})!;
    expect(replay.recent.estimated).toBeNull();
    expect(replay.recent.load).toBe(80);
    expect(replay.series.map(item=>item.key)).toEqual(['load','frequency','volume']);
    expect(replay.milestones).toEqual([]);
  });

  it('groups long histories into real calendar months',()=>{
    const replay=performanceReplay(history([workout(-1300,80),workout(-4,100)]),{})!;
    const frequency=replay.series.find(item=>item.key==='frequency')!;
    expect(frequency.label).toBe('Workouts per month');
    expect(frequency.points.every(point=>point.at.endsWith('-01'))).toBe(true);
    expect(frequency.points.reduce((count,point)=>count+point.value,0)).toBe(2);
  });
});

describe('Strength Passport',()=>{
  it('selects a small set of facts and leaves bodyweight and relative strength off by default',()=>{
    const session=workout(-2,100);
    const facts=passportFacts(history([session],[weight(-2,80)]));
    const defaults=passportDefaults(facts);
    expect(defaults).not.toContain('weight');
    expect(defaults).not.toContain('relative');
    expect(defaults.length).toBeLessThanOrEqual(4);
    const customized=passportContents(facts,['weight','recorded'],'Sam');
    expect(customized).toEqual({name:'Sam',facts:[
      {label:'Latest recorded bodyweight',value:'80 kg'},{label:'Recorded max · Bench press',value:'100 kg'},
    ]});
    expect(passportDimensions).toEqual({width:1200,height:1500});
  });

  it('rejects account details from export data and never passes workout or measurement IDs',()=>{
    expect(safePassportText('owner@example.invalid')).toBe('');
    expect(safePassportText('00000000-0000-0000-0000-000000000001')).toBe('');
    const input=history([workout(-2,100)],[weight(-2,80)]);
    input.templates=new Map([['bench',{...templates.get('bench')!,title:'owner@example.invalid'}]]);
    const facts=passportFacts(input);
    const exportData=JSON.stringify(passportContents(facts,facts.map(fact=>fact.key),'owner@example.invalid'));
    expect(exportData).not.toMatch(/owner@|synthetic-bench|measurement-/);
    expect(exportData).toContain('Athlete');
  });

  it('renders only the chosen safe fields to a local PNG canvas',async()=>{
    const fillText=vi.fn();
    const canvas={
      width:0,height:0,
      getContext:()=>({fillText,fillRect:vi.fn()}),
      toBlob:vi.fn((done:(result:Blob)=>void,mime:string)=>done(new Blob(['synthetic raster'],{type:mime}))),
    };
    const transport=vi.fn();
    vi.stubGlobal('document',{createElement:()=>canvas});
    vi.stubGlobal('fetch',transport);
    try{
      const facts=passportFacts(history([workout(-2,100)],[weight(-2,80)]));
      const png=await passportPng(passportContents(facts,['recorded'],'Sample Athlete'),true);
      expect(png.type).toBe('image/png');
      expect(canvas).toMatchObject({width:1200,height:1500});
      expect(fillText.mock.calls.map(([text])=>text)).toEqual([
        'PERSONALGYMTRACK','Strength Passport','Sample Athlete','Recorded max · Bench press','100 kg','Your strength. Your story.',
      ]);
      expect(transport).not.toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();}
  });
});

describe('Training Fingerprint',()=>{
  const blocks=[-84,-56,-28].flatMap((from,index)=>[0,3,7,10,14,17,21,24].flatMap((offset,i)=>[
    workout(from+offset,75+index*10+i,'bench'),workout(from+offset,65+index*8+i,'row'),
  ]));
  it('calculates distinct axes and compares the previous fingerprint with its own baseline',()=>{
    const result=trainingFingerprint(history(blocks));
    expect(result.currentDates).toBe(8);
    expect(result.previousDates).toBe(8);
    expect(result.current.consistency).toBe(100);
    expect(result.current.frequency).toBeCloseTo(100*8/28);
    expect(result.current.progression).toBe(100);
    expect(result.current.balance).toBeCloseTo(55);
    expect(result.current.volume).toBeGreaterThan(50);
    expect(result.previous.volume).toBeGreaterThan(50);
    expect(result.archetype?.title).toBe('The Progressive Lifter');
  });
  it('leaves insufficient dimensions unavailable and omits a prior profile with no coverage',()=>{
    const empty=trainingFingerprint(history([workout(-2,100)]));
    expect(empty.archetype).toBeNull();
    expect(Object.values(empty.current).every(value=>value===null)).toBe(true);
    const sparse=trainingFingerprint(history([-24,-18,-12,-6].map(offset=>workout(offset,80))));
    expect(sparse.current.consistency).toBe(100);
    expect(sparse.current.strength).toBeNull();
    expect(sparse.current.volume).toBeNull();
    expect(sparse.previousDates).toBeNull();
    expect(athleteArchetype({...sparse.current,balance:72})?.title).toBe('The Balanced Athlete');
  });
  it('keeps separate owner inputs isolated across consecutive calculations',()=>{
    const owned=history(blocks), empty=history([]);
    expect(trainingFingerprint(owned).currentDates).toBe(8);
    expect(trainingFingerprint(empty).currentDates).toBe(0);
    expect(passportFacts(empty)).toEqual([]);
    expect(performanceReplay(empty,{})).toBeNull();
  });
});
