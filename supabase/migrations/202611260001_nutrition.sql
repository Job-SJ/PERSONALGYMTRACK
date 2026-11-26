begin;

create table public.nutrition_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  day date not null,
  meal text not null check (meal in ('Breakfast','Lunch','Dinner','Snacks')),
  portion jsonb not null check (jsonb_typeof(portion) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id,id)
);
create index nutrition_entries_day on public.nutrition_entries(user_id,day desc,id);

create table public.nutrition_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  kind text not null check (kind in ('food','meal','recipe')),
  portions jsonb not null check (jsonb_typeof(portions) = 'array'),
  servings numeric not null check (servings > 0 and servings <= 1000),
  primary key (user_id,id)
);

create table public.nutrition_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kcal numeric not null check (kcal > 0 and kcal <= 20000),
  protein numeric not null check (protein between 0 and 2000),
  carbs numeric not null check (carbs between 0 and 2000),
  fat numeric not null check (fat between 0 and 2000),
  primary key (user_id,day)
);

create table public.nutrition_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id,day)
);

do $$
declare t text;
begin
  foreach t in array array['nutrition_entries','nutrition_library','nutrition_targets','nutrition_days'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
    execute format('create policy verified_session on public.%I as restrictive to authenticated using ((select private.training_aal_allowed())) with check ((select private.training_aal_allowed()))',t);
  end loop;
end $$;

commit;
