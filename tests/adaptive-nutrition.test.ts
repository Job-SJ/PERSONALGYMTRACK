import {expect,it} from 'vitest';
import {adaptiveMaintenance,adaptiveTarget} from '../lib/adaptive-nutrition';
import {shiftDay,type Entry} from '../lib/nutrition';

const today='2025-02-03';
const entries:Entry[]=Array.from({length:28},(_,index)=>{
  const day=shiftDay(today,index-28);
  return {id:day,day,meal:'Lunch',created_at:day,portion:{amount:1,unit:'serving',
    food:{name:'Synthetic diary entry',basis:'serving',source:'Custom label',preparation:'As sold',values:{kcal:2400}}}};
});
const completed=entries.map(row=>row.day);
const measurements=[-28,-26,-24,-7,-5,-3].map((offset,index)=>({day:shiftDay(today,offset),value:index<3?80:81}));

it('requires reliable logging and independent baseline and recent weight observations',()=>{
  expect(adaptiveMaintenance(today,entries,completed.slice(0,20),measurements).estimate).toBeNull();
  expect(adaptiveMaintenance(today,entries,completed,measurements.slice(0,3)).estimate).toBeNull();
  expect(adaptiveMaintenance(today,entries.slice(0,20),completed,measurements).days).toBe(20);
});

it('holds its observation window within a week and suggests bounded changes',()=>{
  const result=adaptiveMaintenance(today,entries,completed,measurements);
  expect(result.estimate).toMatchObject({intakeMean:2400,weightChange:1,kcal:2200});
  expect(adaptiveMaintenance(shiftDay(today,6),entries,completed,measurements)).toEqual(result);
  expect(adaptiveTarget(2200,-150,2400)).toBe(2250);
  expect(adaptiveTarget(1400,-150,1700)).toBeNull();
});
