alter table public.workouts add column routine_id text;
alter table public.workout_exercises add column superset_id integer;
alter table public.workout_sets add column custom_metric numeric;

create or replace function public.store_workouts(items jsonb, deleted_ids text[] default '{}')
returns void language plpgsql security invoker set search_path = '' as $$
declare w jsonb; e jsonb; s jsonb;
begin
  delete from public.workouts where id = any(deleted_ids) and source = 'hevy';
  for w in select value from jsonb_array_elements(items) loop
    insert into public.workouts(id,title,source,started_at,ended_at,notes,routine_id)
    values (w->>'id',w->>'title',w->>'source',(w->>'started_at')::timestamptz,(w->>'ended_at')::timestamptz,w->>'notes',w->>'routine_id')
    on conflict (user_id,id) do update set title=excluded.title, started_at=excluded.started_at,
      ended_at=excluded.ended_at, notes=excluded.notes, routine_id=case
        when w ? 'routine_id' then excluded.routine_id else public.workouts.routine_id end;
    delete from public.workout_exercises where workout_id=w->>'id';
    for e in select value from jsonb_array_elements(w->'workout_exercises') loop
      insert into public.workout_exercises(workout_id,position,template_id,title,notes,superset_id)
      values(w->>'id',(e->>'position')::int,e->>'template_id',e->>'title',e->>'notes',(e->>'superset_id')::int);
      for s in select value from jsonb_array_elements(e->'workout_sets') loop
        insert into public.workout_sets(workout_id,exercise_position,position,type,weight_kg,reps,duration_seconds,distance_meters,rpe,custom_metric)
        values(w->>'id',(e->>'position')::int,(s->>'position')::int,s->>'type',(s->>'weight_kg')::numeric,
          (s->>'reps')::int,(s->>'duration_seconds')::numeric,(s->>'distance_meters')::numeric,(s->>'rpe')::numeric,(s->>'custom_metric')::numeric);
      end loop;
    end loop;
  end loop;
end $$;
