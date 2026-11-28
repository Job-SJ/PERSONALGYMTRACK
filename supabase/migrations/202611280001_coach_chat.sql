alter table public.coach_settings add column chat_consent_at timestamptz;

create table public.coach_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 80),
  updated_at timestamptz not null default now(),
  unique (id,user_id)
);
create index coach_conversations_owner_time on public.coach_conversations(user_id,updated_at desc,id);

create table public.coach_turns (
  id uuid primary key,
  conversation_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  prompt text not null check (octet_length(prompt) between 1 and 1800),
  answer text check (octet_length(answer) between 1 and 6000),
  attempt uuid,
  started_at timestamptz,
  foreign key (conversation_id,user_id) references public.coach_conversations(id,user_id) on delete cascade
);
create index coach_turns_conversation_time on public.coach_turns(conversation_id,created_at desc,id);
create unique index coach_turns_one_generation on public.coach_turns(conversation_id) where attempt is not null;

alter table public.coach_conversations enable row level security;
alter table public.coach_turns enable row level security;
create policy coach_conversations_read on public.coach_conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy coach_turns_read on public.coach_turns for select to authenticated using ((select auth.uid()) = user_id);
create policy verified_session on public.coach_conversations as restrictive for select to authenticated using ((select private.training_aal_allowed()));
create policy verified_session on public.coach_turns as restrictive for select to authenticated using ((select private.training_aal_allowed()));
revoke all on public.coach_conversations,public.coach_turns from public,anon,authenticated;
grant select (id,title,updated_at,user_id) on public.coach_conversations to authenticated;
grant select (id,conversation_id,user_id,created_at,prompt,answer) on public.coach_turns to authenticated;
grant select,insert,update,delete on public.coach_conversations,public.coach_turns to service_role;

create function private.limit_coach_conversations() returns trigger
language plpgsql set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,1));
  if (select count(*) from public.coach_conversations where user_id=new.user_id)>=100 then
    raise exception using errcode='P0001',message='Coach conversation limit reached';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_coach_conversations() from public,anon,authenticated;
create trigger limit_coach_conversations before insert on public.coach_conversations
for each row execute function private.limit_coach_conversations();

create function private.limit_coach_turns() returns trigger
language plpgsql set search_path='' as $$
begin
  perform 1 from public.coach_conversations where id=new.conversation_id and user_id=new.user_id for update;
  if (select count(*) from public.coach_turns where conversation_id=new.conversation_id)>=120 then
    raise exception using errcode='P0001',message='Coach message limit reached';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_coach_turns() from public,anon,authenticated;
create trigger limit_coach_turns before insert on public.coach_turns
for each row execute function private.limit_coach_turns();

create or replace function public.pgt_schema_ready()
returns boolean language sql stable set search_path='' as $$
  select to_regclass('public.workouts') is not null
    and to_regclass('public.nutrition_days') is not null
    and to_regclass('public.integration_credentials') is not null
    and to_regclass('public.coach_usage') is not null
    and to_regclass('public.coach_conversations') is not null
    and to_regclass('public.coach_turns') is not null
    and to_regclass('public.push_registrations') is not null
    and to_regprocedure('public.acquire_sync(uuid)') is not null
    and to_regprocedure('public.reserve_coach_request(uuid,uuid,bigint)') is not null
    and exists(select from pg_catalog.pg_policies where schemaname='public' and tablename='workouts'
      and policyname='verified_session' and permissive='RESTRICTIVE');
$$;
