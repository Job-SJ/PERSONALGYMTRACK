-- Run only in a disposable Supabase database after migrations.
begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.body_measurements(day,kind,value) values ('2025-01-01','weight',80);
select public.store_workouts('[{"id":"fixture","title":"Fixture","source":"hevy","started_at":"2025-01-01T00:00:00Z","ended_at":"2025-01-01T01:00:00Z","workout_exercises":[{"position":0,"template_id":"fixture","title":"Press","workout_sets":[{"position":0,"type":"normal","reps":5,"weight_kg":80}]}]}]');
select public.store_workouts('[{"id":"fixture","title":"Fixture edited","source":"hevy","started_at":"2025-01-01T00:00:00Z","ended_at":"2025-01-01T01:00:00Z","workout_exercises":[{"position":0,"template_id":"fixture","title":"Press","workout_sets":[{"position":0,"type":"failure","reps":4,"weight_kg":85}]}]}]');
do $$ begin
  if (select count(*) from public.workout_sets)<>1 then raise exception 'Owner import incomplete'; end if;
  if (select title from public.workouts where id='fixture') <> 'Fixture edited' then raise exception 'Workout update missing'; end if;
  if (select weight_kg from public.workout_sets where workout_id='fixture') <> 85 then raise exception 'Workout set replacement missing'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ begin
  if exists(select from public.body_measurements) or exists(select from public.workouts) or exists(select from public.workout_sets)
    then raise exception 'Cross-user data leak'; end if;
  update public.body_measurements set value=1;
  if found then raise exception 'Cross-user update'; end if;
  begin
    insert into public.body_measurements(user_id,day,kind,value) values ('10000000-0000-0000-0000-000000000001','2025-01-02','weight',80);
    raise exception 'Forged owner was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.store_workouts('[]','{fixture}');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ begin
  if (select count(*) from public.workouts)<>1 then raise exception 'Cross-user deletion'; end if;
end $$;
select public.store_workouts('[]','{fixture}');
do $$ begin
  if exists(select from public.workout_sets) or exists(select from public.workout_exercises) or exists(select from public.workouts)
    then raise exception 'Workout deletion did not cascade'; end if;
end $$;
rollback;
