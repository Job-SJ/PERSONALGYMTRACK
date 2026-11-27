create table public.integration_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('hevy', 'openrouter')),
  envelope jsonb,
  primary key (user_id, provider)
);

alter table public.integration_credentials enable row level security;
revoke all on public.integration_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.integration_credentials to service_role;

create table public.integration_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('hevy_connection')),
  next_at timestamptz not null,
  primary key (user_id, operation)
);

alter table public.integration_attempts enable row level security;
revoke all on public.integration_attempts from public, anon, authenticated;
grant select, insert, update on public.integration_attempts to service_role;

create function public.reserve_integration_attempt(owner_id uuid, operation_name text)
returns boolean language sql set search_path = '' as $$
  with reserved as (
    insert into public.integration_attempts as attempts (user_id, operation, next_at)
    values (owner_id, operation_name, statement_timestamp() + interval '15 seconds')
    on conflict (user_id, operation) do update set next_at = excluded.next_at
      where attempts.next_at <= statement_timestamp()
    returning 1
  )
  select exists (select from reserved);
$$;

revoke all on function public.reserve_integration_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_integration_attempt(uuid, text) to service_role;
