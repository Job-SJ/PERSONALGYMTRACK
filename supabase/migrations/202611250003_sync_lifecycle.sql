alter table public.sync_state add column next_sync_at timestamptz;

create or replace function public.acquire_sync(token uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.sync_state(lease_id,lease_until)
  values(token,now()+interval '5 minutes')
  on conflict(user_id) do update set lease_id=excluded.lease_id, lease_until=excluded.lease_until
    where (public.sync_state.lease_until is null or public.sync_state.lease_until < now())
      and (public.sync_state.next_sync_at is null or public.sync_state.next_sync_at <= now());
  return found;
end $$;

create function public.finish_sync(token uuid, new_cursor timestamptz, failure text) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.sync_state
  set cursor_at=coalesce(greatest(cursor_at,new_cursor),cursor_at),
      lease_until=null, lease_id=null, last_error=left(failure,200),
      next_sync_at=now()+interval '1 minute'
  where user_id=(select auth.uid()) and lease_id=token and lease_until>now();
  return found;
end $$;
revoke all on function public.finish_sync(uuid,timestamptz,text) from public, anon;
grant execute on function public.finish_sync(uuid,timestamptz,text) to authenticated;
