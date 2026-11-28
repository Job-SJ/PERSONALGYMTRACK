alter table public.coach_turns
  add column evidence jsonb,
  add column local_analysis boolean not null default false;

grant select (evidence,local_analysis) on public.coach_turns to authenticated;
