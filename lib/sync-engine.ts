import { HevyError, type hevy } from './hevy';
import { normalize, type Template, type Workout } from './model';

type Source = ReturnType<typeof hevy>;
type Store = {
  templates(items: Template[]): Promise<void>;
  workouts(items: Workout[], deleted: string[]): Promise<void>;
  count(): Promise<number>;
};

export async function importHevy(source:Source, store:Store, cursor:string|null, started:Date, signal:AbortSignal,backfill=false) {
  function checkTime() {
    if (signal.aborted) throw new HevyError('Synchronization timed out. Try again.');
  }
  for await (const page of source.templates(signal)) {
    checkTime();
    if (page.length) await store.templates(page.map(t=>({
      id:t.id,title:t.title,type:t.type,equipment:t.equipment,
      primary_muscle:t.primary_muscle_group,secondary_muscles:t.secondary_muscle_groups ?? [],
    })));
  }
  if (!cursor||backfill) {
    const seen=new Set<string>();
    for await (const page of source.workouts(signal)) {
      checkTime();
      const distinct=page.filter(w=>{
        if (seen.has(w.id)) return false;
        seen.add(w.id);
        return true;
      });
      if (distinct.length) await store.workouts(distinct.map(w=>normalize(w,'hevy')),[]);
    }
  }

  // Close the gap between the start of a full scan and its completion, and
  // reread the previous boundary to tolerate minor clock skew.
  const overlap=new Date((cursor?Date.parse(cursor):+started)-5*60000).toISOString();
  const seen=new Set<string>();
  for await (const page of source.events(signal,overlap)) {
    checkTime();
    const changed:Workout[]=[],deleted:string[]=[];
    for (const event of page) {
      const id=event.type==='updated'?event.workout.id:event.id;
      if (seen.has(id)) continue;
      seen.add(id);
      if (event.type==='updated') changed.push(normalize(event.workout,'hevy'));
      else deleted.push(id);
    }
    if (changed.length || deleted.length) await store.workouts(changed,deleted);
  }

  const expected=await source.test(signal);
  checkTime();
  if (await store.count()!==expected.workout_count) {
    throw new HevyError('Hevy and local workout counts differ. Retry after any edits in Hevy have finished.');
  }
  checkTime();
  return started.toISOString();
}
