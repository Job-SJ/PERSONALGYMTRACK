import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {hevy,HevyError} from './hevy';
import {importHevy} from './sync-engine';

export async function runSync(client:SupabaseClient,userId:string,key:string,backfill=false) {
  const token=crypto.randomUUID();
  const start=new Date();
  const lease=await client.rpc('acquire_sync',{token});
  if (lease.error) throw new HevyError('Sync state is unavailable.');
  if (!lease.data) throw new HevyError('A sync is already running or recently finished. Wait a minute and try again.');
  const signal=AbortSignal.timeout(100000);
  const source=hevy(key);
  let cursor:string|null=null;
  let failure:string|null=null;
  try {
    const state=await client.from('sync_state').select('cursor_at').eq('user_id',userId).single();
    if (state.error) throw new Error('Sync state is unavailable.');
    cursor=await importHevy(source,{
      async templates(items){
        const result=await client.from('exercise_templates').upsert(items.map(t=>({...t,user_id:userId}))).abortSignal(signal);
        if (result.error) throw new Error('Exercise templates could not be stored.');
      },
      async workouts(items,deleted_ids){
        const result=await client.rpc('store_workouts',{items,deleted_ids}).abortSignal(signal);
        if (result.error) throw new Error('Workouts could not be stored.');
      },
      async count(){
        const result=await client.from('workouts').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('source','hevy').abortSignal(signal);
        if (result.error || result.count===null) throw new Error('Workout count is unavailable.');
        return result.count;
      },
    },state.data.cursor_at,start,signal,backfill);
  } catch (cause) {
    failure=cause instanceof HevyError?cause.message:'Synchronization failed. Check the database setup and try again.';
  }
  const finish=await client.rpc('finish_sync',{token,new_cursor:cursor,failure});
  if(finish.error || !finish.data) throw new HevyError('Sync status could not be saved. Try again after the sync lease expires.');
  if(failure) throw new HevyError(failure);
}
