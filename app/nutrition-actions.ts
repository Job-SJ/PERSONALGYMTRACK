'use server';

import {revalidatePath} from 'next/cache';
import {session} from '../lib/supabase';
import {lookupFoods,writeNutrition} from '../lib/nutrition-service';
import type {SearchMode} from '../lib/open-food-facts';

export async function saveNutrition(input:unknown){
  const {client,user}=await session();
  const result=await writeNutrition(client,user.id,input);
  if(result.ok){
    revalidatePath('/app/nutrition');
    revalidatePath('/app');
  }
  return result;
}

export async function searchFoods(mode:SearchMode,input:string){
  await session();
  return lookupFoods(mode,input);
}
