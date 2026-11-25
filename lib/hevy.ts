import { z } from 'zod';
import {eventSchema,templateSchema,workoutSchema} from './model';

const origin='https://api.hevyapp.com';
export class HevyError extends Error {}
export function hevy(key:string, transport=fetch, sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))) {
  async function get(path:string, query:URLSearchParams, signal:AbortSignal) {
    for (let attempt=0;attempt<3;attempt++) {
      let response:Response|undefined;
      try {
        response=await transport(origin+path+'?'+query,{headers:{'api-key':key},redirect:'error',
          cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(7000)])});
      } catch {
        if (signal.aborted || attempt===2) throw new HevyError('Hevy could not be reached.');
      }
      if (response?.ok) return response.json();
      const status=response?.status;
      if (status===401 || status===403) throw new HevyError('Hevy rejected the configured key.');
      if (status && status!==429 && status<500) throw new HevyError('Hevy returned an unexpected response.');
      if (attempt===2 || signal.aborted) break;
      const header=response?.headers.get('retry-after');
      const retry=header ? (Number.isFinite(Number(header)) ? Number(header)*1000 : Date.parse(header)-Date.now()) : 0;
      if (retry>8000) break;
      await sleep(Math.max(retry || 0,350*2**attempt));
    }
    throw new HevyError('Hevy is temporarily unavailable. Try again later.');
  }
  async function* pages<T>(path:string, field:string, item:z.ZodType<T>, size:number, signal:AbortSignal, since?:string) {
    const envelope=z.object({page:z.number().int(),page_count:z.number().int().nonnegative()}).catchall(z.unknown());
    const entries=z.array(item);
    for (let page=1;page<=2000;page++) {
      const q=new URLSearchParams({page:String(page),pageSize:String(size)});
      if (since) q.set('since',since);
      const result=envelope.parse(await get(path,q,signal));
      if (result.page!==page) throw new HevyError('Hevy returned an invalid page sequence.');
      yield entries.parse(result[field]);
      if (page>=result.page_count) return;
    }
    throw new HevyError('The import exceeded the page limit.');
  }
  return {
    test:async(signal:AbortSignal)=>z.object({workout_count:z.number().int().nonnegative()}).parse(
      await get('/v1/workouts/count',new URLSearchParams(),signal)),
    workouts:(s:AbortSignal)=>pages('/v1/workouts','workouts',workoutSchema,10,s),
    templates:(s:AbortSignal)=>pages('/v1/exercise_templates','exercise_templates',templateSchema,100,s),
    events:(s:AbortSignal,since:string)=>pages('/v1/workouts/events','events',eventSchema,10,s,since),
  };
}
