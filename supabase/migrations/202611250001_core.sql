create table public.workouts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  title text not null,
  source text not null check (source in ('hevy','csv')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  notes text,
  primary key (user_id,id),
  check (ended_at >= started_at)
);
create index workouts_started on public.workouts(user_id,started_at desc,id);
create table public.workout_exercises (
  user_id uuid not null default auth.uid(),
  workout_id text not null,
  position integer not null,
  template_id text not null,
  title text not null,
  notes text,
  primary key (user_id,workout_id,position),
  foreign key (user_id,workout_id) references public.workouts on delete cascade
);
create table public.workout_sets (
  user_id uuid not null default auth.uid(),
  workout_id text not null,
  exercise_position integer not null,
  position integer not null,
  type text not null check (type in ('normal','warmup','dropset','failure')),
  weight_kg numeric,
  reps integer check (reps >= 0),
  duration_seconds numeric check (duration_seconds >= 0),
  distance_meters numeric check (distance_meters >= 0),
  rpe numeric check (rpe between 0 and 10),
  primary key (user_id,workout_id,exercise_position,position),
  foreign key (user_id,workout_id,exercise_position) references public.workout_exercises on delete cascade
);
create table public.exercise_templates (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  title text not null,
  type text not null,
  equipment text,
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  primary key (user_id,id)
);
create table public.body_measurements (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id uuid not null default gen_random_uuid(),
  day date not null,
  kind text not null check (kind in ('weight','body_fat','muscle_mass','waist','arm','chest','thigh','calf')),
  value numeric not null check (value > 0 and value <= 700),
  source text not null default 'manual' check (source in ('manual','hevy')),
  primary key (user_id,id),
  unique (user_id,day,kind)
);
create table public.sync_state (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  cursor_at timestamptz,
  lease_until timestamptz,
  lease_id uuid,
  last_error text
);
create table public.preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','oled','light')),
  units text not null default 'kg' check (units in ('kg','lb')),
  widgets text[]
);
create table public.goals (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id uuid not null default gen_random_uuid(),
  title text not null check (length(title) between 1 and 100),
  kind text not null check (kind in ('workouts','weekly_workouts','weight')),
  target numeric not null check (target > 0),
  deadline date,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  primary key (user_id,id)
);
do $$
declare t text;
begin
  foreach t in array array['workouts','workout_exercises','workout_sets','exercise_templates','body_measurements','sync_state','preferences','goals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('create policy owner on public.%I to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  end loop;
end $$;

create function public.store_workouts(items jsonb, deleted_ids text[] default '{}')
returns void language plpgsql security invoker set search_path = '' as $$
declare w jsonb; e jsonb; s jsonb;
begin
  delete from public.workouts where id = any(deleted_ids) and source = 'hevy';
  for w in select value from jsonb_array_elements(items) loop
    insert into public.workouts(id,title,source,started_at,ended_at,notes)
    values (w->>'id',w->>'title',w->>'source',(w->>'started_at')::timestamptz,(w->>'ended_at')::timestamptz,w->>'notes')
    on conflict (user_id,id) do update set title=excluded.title, started_at=excluded.started_at,
      ended_at=excluded.ended_at, notes=excluded.notes;
    delete from public.workout_exercises where workout_id=w->>'id';
    for e in select value from jsonb_array_elements(w->'workout_exercises') loop
      insert into public.workout_exercises(workout_id,position,template_id,title,notes)
      values(w->>'id',(e->>'position')::int,e->>'template_id',e->>'title',e->>'notes');
      for s in select value from jsonb_array_elements(e->'workout_sets') loop
        insert into public.workout_sets(workout_id,exercise_position,position,type,weight_kg,reps,duration_seconds,distance_meters,rpe)
        values(w->>'id',(e->>'position')::int,(s->>'position')::int,s->>'type',(s->>'weight_kg')::numeric,
          (s->>'reps')::int,(s->>'duration_seconds')::numeric,(s->>'distance_meters')::numeric,(s->>'rpe')::numeric);
      end loop;
    end loop;
  end loop;
end $$;
revoke all on function public.store_workouts(jsonb,text[]) from public, anon;
grant execute on function public.store_workouts(jsonb,text[]) to authenticated;

create function public.acquire_sync(token uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.sync_state(lease_id,lease_until)
  values(token,now()+interval '5 minutes')
  on conflict(user_id) do update set lease_id=excluded.lease_id, lease_until=excluded.lease_until
    where public.sync_state.lease_until is null or public.sync_state.lease_until < now();
  return found;
end $$;
revoke all on function public.acquire_sync(uuid) from public, anon;
grant execute on function public.acquire_sync(uuid) to authenticated;
