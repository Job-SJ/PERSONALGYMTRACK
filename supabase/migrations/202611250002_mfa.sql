-- Data API and invoker RPCs must also honor TOTP for enrolled accounts.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create function private.training_aal_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal' = 'aal2',false) or not exists (
    select 1 from auth.mfa_factors
    where user_id = auth.uid() and status = 'verified' and factor_type = 'totp'
  );
$$;
revoke all on function private.training_aal_allowed() from public, anon;
grant execute on function private.training_aal_allowed() to authenticated;
do $$
declare t text;
begin
  foreach t in array array['workouts','workout_exercises','workout_sets','exercise_templates','body_measurements','sync_state','preferences','goals'] loop
    execute format('create policy verified_session on public.%I as restrictive to authenticated using ((select private.training_aal_allowed())) with check ((select private.training_aal_allowed()))',t);
  end loop;
end $$;
