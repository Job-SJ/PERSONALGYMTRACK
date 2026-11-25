-- Read-only check. No user rows or secrets are returned.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       count(p.polname) filter (where p.polpermissive) as owner_policies,
       count(p.polname) filter (where not p.polpermissive) as restrictive_policies,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policy p on p.polrelid=c.oid
where n.nspname='public'
  and c.relname in ('workouts','workout_exercises','workout_sets','exercise_templates',
                    'body_measurements','sync_state','preferences','goals')
group by c.oid
order by c.relname;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('workouts','workout_exercises','workout_sets','exercise_templates',
                    'body_measurements','sync_state','preferences','goals')
order by tablename, policyname;

select c.relname as table_name, con.conname as constraint_name,
       con.convalidated as validated, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('workouts','workout_exercises','workout_sets','exercise_templates',
                    'body_measurements','sync_state','preferences','goals')
order by c.relname, con.conname;

select c.relname as table_name, idx.relname as index_name,
       i.indisvalid as valid, i.indisready as ready, pg_get_indexdef(idx.oid) as definition
from pg_index i
join pg_class c on c.oid = i.indrelid
join pg_class idx on idx.oid = i.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('workouts','workout_exercises','workout_sets','exercise_templates',
                    'body_measurements','sync_state','preferences','goals')
order by c.relname, idx.relname;

select p.proname as rpc, p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('acquire_sync','finish_sync','store_workouts')
order by p.proname;
