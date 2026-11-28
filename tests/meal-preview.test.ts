import {expect,it} from 'vitest';
import {customMealFood,isMealLogMessage,matchMealLine,mealPreviewTotals,parseMealText} from '../lib/meal-preview';
import type {Food} from '../lib/nutrition';

const product:Food={name:'Synthetic oats',brand:'Fixture',code:'1234567890123',source:'Open Food Facts',preparation:'As sold',
  basis:'g',values:{kcal:350,protein:10,carbs:55,fat:8}};

it('parses described meals, decimal portions and barcodes without changing the diary',()=>{
  expect(parseMealText('Log my lunch: 40g synthetic oats and 200 ml synthetic milk')).toEqual({meal:'Lunch',lines:[
    {query:'synthetic oats',amount:40,unit:'g'},{query:'synthetic milk',amount:200,unit:'ml'},
  ]});
  expect(parseMealText('Ik at 1,5 l synthetic milk,250g synthetic oats voor ontbijt').lines).toEqual([
    {query:'synthetic milk',amount:1500,unit:'ml'},{query:'synthetic oats',amount:250,unit:'g'},
  ]);
  expect(parseMealText('1234567890123').lines[0]).toMatchObject({query:'1234567890123',amount:null});
  expect(isMealLogMessage('Log 40g synthetic oats')).toBe(true);
  expect(isMealLogMessage('How many calories did I log for lunch?')).toBe(false);
  expect(()=>parseMealText('a,b,c,d,e,f,g')).toThrow('six');
});

it('preselects only a unique compatible exact product or barcode',()=>{
  const line={query:'Synthetic oats',amount:40,unit:'g' as const};
  expect(matchMealLine(line,[product,product]).selected).toBe(0);
  expect(matchMealLine(line,[product,{...product,code:'1234567890124'}]).selected).toBeNull();
  expect(matchMealLine({...line,unit:'ml'},[product]).selected).toBeNull();
  expect(matchMealLine({...line,query:'oats'},[product]).selected).toBeNull();
  expect(matchMealLine({...line,query:product.code!},[product]).selected).toBe(0);
  expect(mealPreviewTotals([{food:product,amount:40,unit:'g'}])).toContain('Estimated 140 kcal');
  expect(mealPreviewTotals([{food:customMealFood(line),amount:40,unit:'g'}])).toBe('Calories unavailable');
});
