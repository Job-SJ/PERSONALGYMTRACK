import {describe,expect,it,vi} from 'vitest';
import {bestRecords,dayKey,estimate,muscleTotals,relativeStrength,streaks,trainingFrequencyComparison,volume} from '../lib/analytics';
import {normalize,workoutSchema,type Template} from '../lib/model';
import {parseCsv} from '../lib/csv';
import {hevy} from '../lib/hevy';

const template:Template={id:'press',title:'Press',type:'weight_reps',primary_muscle:'chest',secondary_muscles:['triceps','chest','triceps']};
const templates=new Map([[template.id,template]]);
const workout=(id:string,start:string,weight:number)=>normalize(workoutSchema.parse({
  id,title:'Training',start_time:start,end_time:new Date(Date.parse(start)+3600000).toISOString(),exercises:[
    {index:0,title:'Press',exercise_template_id:'press',sets:[{index:0,type:'warmup',weight_kg:999,reps:5},{index:1,type:'normal',weight_kg:weight,reps:5}]},
  ],
}),'hevy');
describe('analytics',()=>{
  const one=workout('a','2025-03-29T22:30:00Z',60);
  const two=workout('b','2025-03-30T22:30:00Z',65);
  it('limits 1RM formulas to comparable rep ranges',()=>{
    expect(estimate(100,1)).toBe(100);
    expect(estimate(100,5)).toBeCloseTo(116.67,2);
    expect(estimate(100,5,'brzycki')).toBe(112.5);
    expect(estimate(100,11)).toBeNull();
  });
  it('excludes warmups, unknown exercises, assisted exercises and missing loads',()=>{
    const [warm,set]=one.workout_exercises[0].workout_sets;
    expect(volume(warm,template)).toBeNull();
    expect(volume(set,template)).toBe(300);
    expect(volume(set)).toBeNull();
    expect(volume(set,{...template,type:'assisted_bodyweight_reps'})).toBeNull();
    expect(volume({...set,weight_kg:null},template)).toBeNull();
  });
  it('counts direct and secondary sets once per region',()=>{
    const totals=muscleTotals([one,two],templates);
    expect(totals.chest).toMatchObject({sessions:2,direct:2,secondary:0});
    expect(totals.triceps).toMatchObject({sessions:2,direct:0,secondary:2});
  });
  it('tracks records in chronological order even with unsorted workouts',()=>{
    expect(bestRecords([two,one],templates).filter(r=>r.metric==='Max weight').map(r=>r.value)).toEqual([65,60]);
  });
  it('buckets dates in Amsterdam across daylight-saving time',()=>{
    expect(dayKey(two.started_at)).toBe('2025-03-31');
    expect(streaks([one,two],'2025-03-31')).toEqual({current:1,longest:1});
  });
  it('only uses a recent bodyweight measurement on or before the session',()=>{
    const row={id:'w',day:'2025-03-28',kind:'weight',value:75,source:'manual'};
    expect(relativeStrength(90,two.started_at,[row])).toBe(1.2);
    expect(relativeStrength(90,two.started_at,[{...row,day:'2025-04-01'}])).toBeNull();
  });
  it('requires enough history and compares complete equal-length periods',()=>{
    expect(trainingFrequencyComparison([one,two],'2025-04-01')).toBeNull();
    const older=workout('baseline','2025-02-04T10:00:00Z',55);
    expect(trainingFrequencyComparison([one,two,older],'2025-04-01')).toMatchObject({current:2,previous:1,priorStart:'2025-02-04' });
  });
});
describe('Hevy data boundaries',()=>{
  it('normalizes a local-time CSV and produces stable import IDs',()=>{
    const csv='title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps\nTest,"3 Apr 2025, 18:00","3 Apr 2025, 19:00",Press,0,normal,60,5';
    expect(parseCsv(csv)[0]).toMatchObject({started_at:'2025-04-03T16:00:00.000Z',source:'csv'});
    expect(parseCsv(csv.replace(/\n/g,'\r\n'))[0].id).toBe(parseCsv(csv)[0].id);
    expect(()=>parseCsv(csv.replace('3 Apr','30 Mar').replace('18:00','02:00'))).toThrow();
  });
  it('retries throttled reads and preserves paginated deletion events',async()=>{
    const body=(p:number,events:unknown[])=>Response.json({page:p,page_count:2,events});
    const transport=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null,{status:429,headers:{'retry-after':'1'}}))
      .mockResolvedValueOnce(body(1,[{type:'deleted',id:'a',deleted_at:'2026-01-01T00:00:00Z'}]))
      .mockResolvedValueOnce(body(2,[]));
    const sleep=vi.fn(async()=>{});
    const pages=[];
    for await(const page of hevy('fixture-only',transport,sleep).events(new AbortController().signal,'2025-01-01T00:00:00Z')) pages.push(page);
    expect(pages[0][0]).toMatchObject({type:'deleted',id:'a'});
    expect(transport.mock.calls.map(([url])=>new URL(String(url)).searchParams.get('page'))).toEqual(['1','1','2']);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(transport.mock.calls[0][1]?.redirect).toBe('error');
  });
});
