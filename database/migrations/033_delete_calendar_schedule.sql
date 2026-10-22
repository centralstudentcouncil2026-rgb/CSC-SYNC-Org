begin;

-- Permanent deletion is atomic; cancellation continues to retain the record.
create or replace function public.delete_calendar_schedule(p_id uuid, p_version integer)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  schedule public.events;
  removed integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    join public.staff_roles r on r.user_id = p.account_id
    where p.account_id = auth.uid() and p.active
      and r.role::text = 'administrator'
  ) then
    raise exception 'Active administrator access is required.';
  end if;

  select * into schedule from public.events where id = p_id for update;
  if not found then raise exception 'Schedule unavailable.'; end if;
  if p_version is null or schedule.version <> p_version then
    raise exception 'The schedule changed. Refresh before deleting it.';
  end if;
  if exists (
    select 1 from public.event_revisions
    where event_id = p_id and status = 'pending'
  ) then
    raise exception 'Review the pending change request first.';
  end if;

  delete from public.notifications where target_type = 'event' and target_id = p_id;
  delete from public.event_revisions where event_id = p_id;
  delete from public.event_occurrences where event_id = p_id;
  -- Preserve concerns, detaching only the link to the deleted schedule.
  update public.concerns set related_event_id = null where related_event_id = p_id;

  -- Remove child series before their parents; external references cause rollback.
  loop
    delete from public.event_series s where s.event_id = p_id and not exists (
      select 1 from public.event_series child where child.parent_series_id = s.id
    );
    get diagnostics removed = row_count;
    exit when removed = 0;
  end loop;
  if exists (select 1 from public.event_series where event_id = p_id) then
    raise exception 'A linked schedule prevents deletion. Cancel this schedule instead.';
  end if;
  delete from public.events where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

revoke all on function public.delete_calendar_schedule(uuid, integer)
from public, anon;
grant execute on function public.delete_calendar_schedule(uuid, integer)
to authenticated;

notify pgrst, 'reload schema';
commit;
