'use server';

import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {session} from '../lib/supabase';
import {mealSchema,portionSchema,targetSchema} from '../lib/nutrition';
import {dutchMarketFirst,foodSearchUrl,fromOpenFoodFacts,type SearchMode} from '../lib/open-food-facts';

const day=z.iso.date();
const id=z.uuid();
const portions=z.array(portionSchema).min(1).max(60);
const command=z.discriminatedUnion('type',[
  z.object({type:z.literal('log'),id:id.optional(),day,meal:mealSchema,portions}).refine(value=>!value.id||value.portions.length===1),
  z.object({type:z.literal('delete'),id}),
  z.object({type:z.literal('library'),id:id.optional(),name:z.string().trim().min(1).max(160),kind:z.enum(['food','recipe','meal']),portions,servings:z.number().positive().max(1000)}),
  z.object({type:z.literal('remove'),id}),
  z.object({type:z.literal('targets'),day,targets:targetSchema}),
  z.object({type:z.literal('complete'),day,complete:z.boolean()}),
]);

export async function saveNutrition(input:unknown){
  const {client,user}=await session();
  const parsed=command.safeParse(input);
  if(!parsed.success) return {error:parsed.error.issues[0]?.message??'Check your nutrition values.'};
  const value=parsed.data;
  const user_id=user.id;
  let result;
  switch(value.type){
    case 'log': {
      const rows=value.portions.map(portion=>({user_id,day:value.day,meal:value.meal,portion}));
      result=value.id
        ?await client.from('nutrition_entries').update(rows[0]).eq('user_id',user_id).eq('id',value.id).select('id').single()
        :await client.from('nutrition_entries').insert(rows);
      break;
    }
    case 'delete':
      result=await client.from('nutrition_entries').delete().eq('user_id',user_id).eq('id',value.id).select('id').single();
      break;
    case 'library': {
      const row={user_id,name:value.name,kind:value.kind,portions:value.portions,servings:value.servings};
      result=value.id
        ?await client.from('nutrition_library').update(row).eq('user_id',user_id).eq('id',value.id).select('id').single()
        :await client.from('nutrition_library').insert(row);
      break;
    }
    case 'remove':
      result=await client.from('nutrition_library').delete().eq('user_id',user_id).eq('id',value.id).select('id').single();
      break;
    case 'targets':
      result=await client.from('nutrition_targets').upsert({user_id,day:value.day,...value.targets});
      break;
    case 'complete':
      result=value.complete?await client.from('nutrition_days').upsert({user_id,day:value.day}):
        await client.from('nutrition_days').delete().eq('user_id',user_id).eq('day',value.day);
      break;
  }
  if(result.error) return {error:'Could not save your nutrition data. Refresh the diary and try again.'};
  revalidatePath('/app/nutrition');
  return {ok:true};
}

export async function searchFoods(mode:SearchMode,input:string){
  await session();
  const search=z.object({mode:z.enum(['name','brand','barcode']),input:z.string().trim().min(2).max(80)}).safeParse({mode,input});
  if(!search.success||(mode==='barcode'&&!/^\d{4,24}$/.test(search.data.input))) return {error:'Enter a valid product name, brand or numeric barcode.'};
  try{
    const contact=process.env.OPEN_FOOD_FACTS_CONTACT||'https://github.com/Job-SJ/PERSONALGYMTRACK';
    const response=await fetch(foodSearchUrl(mode,search.data.input),{
      headers:{'User-Agent':`PersonalGymTrack/1.0 (${contact})`,Accept:'application/json'},
      next:{revalidate:3600},signal:AbortSignal.timeout(10000),
    });
    if(mode==='barcode'&&response.status===404) return {foods:[]};
    if(!response.ok) return {error:'Open Food Facts is temporarily unavailable. Try again shortly or use a custom food.'};
    const data=await response.json();
    const products:unknown[]=mode==='barcode'?[data.product]:mode==='name'&&Array.isArray(data.hits)?dutchMarketFirst(data.hits):Array.isArray(data.products)?data.products:[];
    return {foods:products.flatMap(product=>fromOpenFoodFacts(product)??[])};
  }catch{
    return {error:'Open Food Facts could not be reached. You can still log a custom food.'};
  }
}
