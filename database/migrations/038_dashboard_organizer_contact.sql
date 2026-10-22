begin;

alter table public.profiles
  add column if not exists messenger_url text not null default '';

-- Return only organizer contacts, with the same schedule visibility as the dashboards.
create or replace function public.schedule_organizer_contact(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  organizer uuid;
  schedule_status text;
  fallback_phone text := '';
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where account_id = auth.uid() and active
  ) then return null; end if;

  if p_kind = 'event' then
    select owner_account_id, status::text, contact_number_snapshot
      into organizer, schedule_status, fallback_phone
    from public.events where id = p_id;
    if not found then return null; end if;
    if organizer <> auth.uid() and not public.is_reviewer()
      and schedule_status not in ('pending', 'changes_requested', 'approved', 'cancelled')
      then return null; end if;
  elsif p_kind = 'booking' then
    select owner_account_id, status::text into organizer, schedule_status
    from public.room_bookings where id = p_id;
    if not found then return null; end if;
    if organizer <> auth.uid() and not public.is_reviewer()
      and schedule_status not in ('pending', 'approved')
      then return null; end if;
  else return null;
  end if;

  return (
    select jsonb_build_object(
      'schedule_id', p_id,
      'phone', coalesce(nullif(btrim(p.phone), ''), fallback_phone, ''),
      'messenger_url', p.messenger_url
    ) from public.profiles p where p.account_id = organizer
  );
end;
$$;
revoke all on function public.schedule_organizer_contact(text, uuid) from public, anon;
grant execute on function public.schedule_organizer_contact(text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
