-- Embedded PostgreSQL fixture with the auth schema defined by tests/isolation.test.ts.
begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
insert into auth.mfa_factors(user_id,status,factor_type) values ('10000000-0000-0000-0000-000000000001','verified','totp');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
insert into public.nutrition_entries(user_id,id,day,meal,portion)
values (auth.uid(),'30000000-0000-0000-0000-000000000003','2026-11-25','Breakfast',
  '{"food":{"name":"Oats","source":"Custom label","preparation":"Raw","basis":"g","values":{"kcal":380}},"amount":50,"unit":"g"}');
insert into public.nutrition_targets values (auth.uid(),'2026-11-25',2500,150,310,73);
insert into public.nutrition_days values (auth.uid(),'2026-11-25');
insert into public.nutrition_library(user_id,name,kind,portions,servings)
select auth.uid(),'Oat bowl',kind,jsonb_build_array(portion),1
from public.nutrition_entries cross join (values ('recipe'),('meal'),('food')) as library(kind);
update public.nutrition_entries set meal='Lunch',portion=jsonb_set(portion,'{amount}','75');
insert into public.nutrition_entries(user_id,day,meal,portion)
select user_id,day,meal,portion from public.nutrition_entries;
delete from public.nutrition_entries where id<>'30000000-0000-0000-0000-000000000003';
-- A confirmation retry keeps the original portion under the owner-scoped key.
insert into public.nutrition_entries(user_id,id,day,meal,portion)
select user_id,id,day,meal,jsonb_set(portion,'{amount}','100') from public.nutrition_entries
on conflict (user_id,id) do nothing;

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $$
declare name text;
declare affected integer;
begin
  foreach name in array array['nutrition_entries','nutrition_targets','nutrition_days','nutrition_library'] loop
    execute format('select count(*) from public.%I',name) into affected;
    if affected<>0 then raise exception 'Cross-user read of %',name; end if;
    execute format('update public.%I set user_id=auth.uid()',name);
    get diagnostics affected = row_count;
    if affected<>0 then raise exception 'Cross-user update of %',name; end if;
    execute format('delete from public.%I',name);
    get diagnostics affected = row_count;
    if affected<>0 then raise exception 'Cross-user delete of %',name; end if;
    if has_table_privilege('anon','public.'||name,'select,insert,update,delete') then raise exception 'Anonymous grants on %',name; end if;
  end loop;
  begin
    insert into public.nutrition_days values ('10000000-0000-0000-0000-000000000001','2026-11-24');
    raise exception 'Cross-user insert';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$ begin
  if exists(select from public.nutrition_entries) or exists(select from public.nutrition_targets)
    or exists(select from public.nutrition_library) or exists(select from public.nutrition_days)
  then raise exception 'Nutrition data visible before TOTP'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
do $$ begin
  if (select count(*) from public.nutrition_entries)<>1 or not exists (
    select from public.nutrition_entries where meal='Lunch' and portion->>'amount'='75' and portion#>>'{food,values,kcal}'='380'
  ) then raise exception 'Diary CRUD or snapshot failed'; end if;
  if (select count(*) from public.nutrition_library)<>3 or (select count(*) from public.nutrition_targets)<>1
    or (select count(*) from public.nutrition_days)<>1 then raise exception 'Nutrition library, target or completion missing'; end if;
end $$;
rollback;
