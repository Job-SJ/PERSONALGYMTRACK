import {z} from 'zod';

export const nutrients=['kcal','protein','carbs','fat','fiber','sugar','salt','sodium'] as const;
export const labels={kcal:'Calories',protein:'Protein',carbs:'Carbs',fat:'Fat',fiber:'Fiber',sugar:'Sugar',salt:'Salt',sodium:'Sodium'};
export const meals=['Breakfast','Lunch','Dinner','Snacks'] as const;
export const mealSchema=z.enum(meals);
export const unitSchema=z.enum(['g','ml','serving']);
export const valuesSchema=z.partialRecord(z.enum(nutrients),z.number().min(0).max(10000).nullable());
export const foodSchema=z.object({
  name:z.string().trim().min(1).max(160),
  brand:z.string().max(160).optional(),
  code:z.string().regex(/^\d{4,24}$/).optional(),
  image:z.string().regex(/^https:\/\/images\.openfoodfacts\.org\//).max(500).optional(),
  source:z.enum(['Open Food Facts','Custom label','Corrected label']),
  preparation:z.enum(['As sold','Raw','Cooked']),
  basis:unitSchema,
  values:valuesSchema,
  serving:z.object({amount:z.number().positive().max(10000),unit:z.enum(['g','ml'])}).optional(),
});
export const portionSchema=z.object({food:foodSchema,amount:z.number().positive().max(100000),unit:unitSchema})
  .refine(({food,unit})=>unitsFor(food).includes(unit),'Choose a unit supported by the label.');
export const targetSchema=z.object({kcal:z.number().positive().max(20000),protein:z.number().min(0).max(2000),carbs:z.number().min(0).max(2000),fat:z.number().min(0).max(2000)});
export type Food=z.infer<typeof foodSchema>;
export type Portion=z.infer<typeof portionSchema>;
export type Values=z.infer<typeof valuesSchema>;
export type Meal=z.infer<typeof mealSchema>;
export type Entry={id:string;day:string;meal:Meal;portion:Portion;created_at:string};
export type Target=z.infer<typeof targetSchema>&{day:string};
export type LibraryItem={id:string;name:string;kind:'food'|'meal'|'recipe';portions:Portion[];servings:number};

export function unitsFor(food:Food):z.infer<typeof unitSchema>[] {
  if(!food.serving) return [food.basis];
  if(food.basis==='serving') return ['serving',food.serving.unit];
  return food.serving.unit===food.basis?[food.basis,'serving']:[food.basis];
}

export function portionValues({food,amount,unit}:Portion):Values {
  let multiplier=amount/(food.basis==='serving'?1:100);
  if(unit!==food.basis){
    if(!food.serving||!unitsFor(food).includes(unit)) return {};
    multiplier=unit==='serving'?amount*food.serving.amount/100:amount/food.serving.amount;
  }
  return Object.fromEntries(nutrients.map(key=>[key,food.values[key]==null?null:food.values[key]*multiplier]));
}

export function sumPortions(portions:Portion[], divisor=1):Values {
  const values=portions.map(portionValues);
  return Object.fromEntries(nutrients.map(key=>[key,values.some(value=>value[key]==null)?null:values.reduce((sum,value)=>sum+(value[key]??0),0)/divisor]));
}

export function shiftDay(day:string,offset:number){
  const date=new Date(day+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+offset);
  return date.toISOString().slice(0,10);
}

export function energyEstimate(age:number,height:number,weight:number,constant:number,activity:number){
  const resting=10*weight+6.25*height-5*age+constant;
  return {resting,maintenance:resting*activity};
}
