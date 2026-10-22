begin;

create or replace function public.keep_admin_schedules_approved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.creator_account_id is distinct from old.creator_account_id then
      raise exception 'The schedule creator cannot be changed.';
    end if;
  end if;

  if exists (
    select 1 from public.staff_roles r
    where r.user_id = new.creator_account_id
      and r.role::text = 'administrator'
  ) then
    if auth.uid() is not null and not exists (
      select 1 from public.staff_roles r
      where r.user_id = auth.uid() and r.role::text = 'administrator'
    ) then
      raise exception 'Only administrators can change admin-created schedules.';
    end if;
    new.status := 'approved';
  end if;
  return new;
end;
$$;

revoke all on function public.keep_admin_schedules_approved()
from public, anon, authenticated;

drop trigger if exists keep_admin_schedules_approved on public.events;
create trigger keep_admin_schedules_approved
before insert or update on public.events
for each row execute function public.keep_admin_schedules_approved();

update public.events e
set status = 'approved', updated_at = now()
where e.status <> 'approved'
  and exists (
    select 1 from public.staff_roles r
    where r.user_id = e.creator_account_id and r.role::text = 'administrator'
  );

update public.event_revisions v
set status = 'rejected', decided_at = now(),
    reason = 'Admin-created schedules are edited directly without approval.'
where v.status = 'pending'
  and exists (
    select 1 from public.events e
    join public.staff_roles r on r.user_id = e.creator_account_id
    where e.id = v.event_id and r.role::text = 'administrator'
  );

notify pgrst, 'reload schema';
commit;
