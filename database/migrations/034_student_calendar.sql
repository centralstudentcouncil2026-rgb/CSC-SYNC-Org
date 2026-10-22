begin;

-- Anonymous students receive only the approved public calendar projection.
create or replace function public.student_calendar_events()
returns table (
  id uuid, title text, organization_name text, category text,
  venue text, public_description text, starts_at timestamptz,
  ends_at timestamptz, frequency text, repeat_until date,
  admin_created boolean, status text, visibility text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select e.id, e.title, p.organization_name, e.category, e.venue,
    e.public_description, o.starts_at, o.ends_at,
    coalesce(s.frequency, 'none'), s.repeat_until,
    exists (select 1 from public.staff_roles r
      where r.user_id = e.creator_account_id
        and r.role::text = 'administrator'),
    e.status::text, e.visibility::text
  from public.events e
  join public.profiles p on p.account_id = e.owner_account_id
  join lateral (
    select x.starts_at, x.ends_at from public.event_occurrences x
    where x.event_id = e.id and not x.cancelled
    order by x.starts_at, x.id limit 1
  ) o on true
  left join lateral (
    select x.frequency, x.repeat_until from public.event_series x
    where x.event_id = e.id order by x.created_at, x.id limit 1
  ) s on true
  where e.status = 'approved' and e.visibility = 'public'
  order by o.starts_at, e.id;
$$;

revoke all on function public.student_calendar_events() from public;
grant execute on function public.student_calendar_events() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
