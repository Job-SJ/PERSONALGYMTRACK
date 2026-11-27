alter table public.integration_attempts drop constraint integration_attempts_operation_check;
alter table public.integration_attempts add check (operation in ('hevy_connection','openrouter_connection','openrouter_setup'));

create table public.coach_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  consent_at timestamptz,
  model text not null check (length(model) between 3 and 160),
  endpoint text not null check (length(endpoint) between 1 and 100),
  credential_source text not null check (credential_source in ('personal','instance')),
  prompt_price numeric not null check (prompt_price between 0 and 1),
  completion_price numeric not null check (completion_price between 0 and 1),
  monthly_micros bigint not null check (monthly_micros between 0 and 50000000),
  revision uuid not null default gen_random_uuid(),
  check (not enabled or consent_at is not null)
);

create table public.coach_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  reserved_micros bigint not null check (reserved_micros >= 0),
  billed_micros bigint check (billed_micros >= 0),
  prompt_tokens integer,
  completion_tokens integer,
  topic text check (length(topic) <= 40),
  context_hash text,
  answer text check (length(answer) <= 6000),
  discarded boolean not null default false
);
create index coach_usage_owner_time on public.coach_usage(user_id,created_at desc);

alter table public.coach_settings enable row level security;
alter table public.coach_usage enable row level security;
revoke all on public.coach_settings,public.coach_usage from public,anon,authenticated;
grant select,insert,update,delete on public.coach_settings,public.coach_usage to service_role;

create function public.reserve_coach_request(owner_id uuid, settings_revision uuid, cost_micros bigint)
returns uuid language plpgsql set search_path = '' as $$
declare
  budget bigint;
  total bigint;
  attempts bigint;
  last_attempt timestamptz;
  request_id uuid;
begin
  select monthly_micros into budget from public.coach_settings
    where user_id=owner_id and revision=settings_revision and enabled and consent_at is not null for update;
  if not found or cost_micros is null or cost_micros < 0 then return null; end if;
  select coalesce(sum(coalesce(billed_micros,reserved_micros)),0),count(*),max(created_at)
  into total,attempts,last_attempt from public.coach_usage
    where user_id=owner_id and created_at>=date_trunc('month',now(),'UTC');
  if total+cost_micros>budget or attempts>=240 or last_attempt>now()-interval '20 seconds' then
    return null;
  end if;
  update public.coach_usage set answer=null,topic=null,context_hash=null,discarded=true
    where id in (
      select id from public.coach_usage where user_id=owner_id and answer is not null
        order by created_at desc,id offset 19
    ) or (user_id=owner_id and created_at<now()-interval '90 days' and answer is not null);
  insert into public.coach_usage(user_id,reserved_micros) values (owner_id,cost_micros) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.reserve_coach_request(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.reserve_coach_request(uuid,uuid,bigint) to service_role;
