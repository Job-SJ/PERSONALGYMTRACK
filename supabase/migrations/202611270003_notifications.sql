create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null check (length(timezone) between 1 and 80),
  reminder_time time not null,
  quiet_start time not null,
  quiet_end time not null,
  categories text[] not null default '{}' check (categories <@ array['nutrition','weight','weekly','record','strength','target']::text[]),
  detailed boolean not null default false,
  checked_at timestamptz,
  last_push_day date
);
create index notification_preferences_schedule on public.notification_preferences(checked_at nulls first,user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('nutrition','weight','weekly','record','strength','target')),
  period text not null check (length(period) between 1 and 32),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(user_id,category,period)
);
create index notifications_owner_time on public.notifications(user_id,created_at desc);

create table public.push_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web','expo')),
  fingerprint text not null unique check (length(fingerprint)=64),
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);
create index push_registrations_owner on public.push_registrations(user_id,updated_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.push_registrations enable row level security;
revoke all on public.notification_preferences,public.notifications,public.push_registrations from public,anon,authenticated;
grant select,insert,update,delete on public.notification_preferences,public.notifications,public.push_registrations to service_role;

create function public.claim_notification_accounts(batch_size integer)
returns setof public.notification_preferences language sql set search_path='' as $$
  with due as (
    select user_id from public.notification_preferences
      where cardinality(categories)>0 and (checked_at is null or checked_at<now()-interval '10 minutes')
      order by checked_at nulls first,user_id limit least(greatest(batch_size,0),40)
      for update skip locked
  )
  update public.notification_preferences as prefs set checked_at=now() from due
    where prefs.user_id=due.user_id returning prefs.*;
$$;
revoke all on function public.claim_notification_accounts(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_accounts(integer) to service_role;

create function public.reserve_notification_push(owner_id uuid, local_day date)
returns boolean language sql set search_path='' as $$
  with reserved as (
    update public.notification_preferences set last_push_day=local_day where user_id=owner_id
      and (last_push_day is null or last_push_day<local_day) returning 1
  )
  select exists (select from reserved);
$$;
revoke all on function public.reserve_notification_push(uuid,date) from public,anon,authenticated;
grant execute on function public.reserve_notification_push(uuid,date) to service_role;

create index workout_exercises_owner_template on public.workout_exercises(user_id,template_id,workout_id);

create function public.has_recent_weight_record(owner_id uuid, local_day date, zone text)
returns boolean language sql stable set search_path='' as $$
  with daily as (
    select e.template_id, max(s.weight_kg) as max_weight
    from public.workouts w
    join public.workout_exercises e on e.user_id=w.user_id and e.workout_id=w.id
    join public.exercise_templates t on t.user_id=e.user_id and t.id=e.template_id and t.type='weight_reps'
    join public.workout_sets s on s.user_id=e.user_id and s.workout_id=e.workout_id and s.exercise_position=e.position
    where w.user_id=owner_id and w.started_at>=local_day::timestamp at time zone zone
      and w.started_at<(local_day+1)::timestamp at time zone zone and s.type<>'warmup' and s.weight_kg>0
    group by e.template_id
  )
  select exists (
    select from daily d
    cross join lateral (
      select max(s.weight_kg) as max_weight
      from public.workout_exercises e
      join public.workouts w on w.user_id=e.user_id and w.id=e.workout_id
      join public.workout_sets s on s.user_id=e.user_id and s.workout_id=e.workout_id and s.exercise_position=e.position
      where e.user_id=owner_id and e.template_id=d.template_id and w.started_at<local_day::timestamp at time zone zone
        and s.type<>'warmup' and s.weight_kg>0
    ) prior
    where d.max_weight>prior.max_weight
  );
$$;
revoke all on function public.has_recent_weight_record(uuid,date,text) from public,anon,authenticated;
grant execute on function public.has_recent_weight_record(uuid,date,text) to service_role;

create function public.register_notification_device(owner_id uuid, device_channel text, device_fingerprint text, device_subscription jsonb)
returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,427));
  insert into public.push_registrations(user_id,channel,fingerprint,subscription)
    values(owner_id,device_channel,device_fingerprint,device_subscription)
    on conflict(fingerprint) do update set user_id=excluded.user_id,channel=excluded.channel,
      subscription=excluded.subscription,updated_at=now();
  delete from public.push_registrations where id in (
    select id from public.push_registrations where user_id=owner_id order by updated_at desc,id offset 8
  );
end;
$$;
revoke all on function public.register_notification_device(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_notification_device(uuid,text,text,jsonb) to service_role;

create function public.pgt_schema_ready()
returns boolean language sql stable set search_path='' as $$
  select to_regclass('public.workouts') is not null
    and to_regclass('public.nutrition_days') is not null
    and to_regclass('public.integration_credentials') is not null
    and to_regclass('public.coach_usage') is not null
    and to_regclass('public.push_registrations') is not null
    and to_regprocedure('public.acquire_sync(uuid)') is not null
    and to_regprocedure('public.reserve_coach_request(uuid,uuid,bigint)') is not null
    and exists(select from pg_catalog.pg_policies where schemaname='public' and tablename='workouts'
      and policyname='verified_session' and permissive='RESTRICTIVE');
$$;
revoke all on function public.pgt_schema_ready() from public,anon,authenticated;
grant execute on function public.pgt_schema_ready() to service_role;
