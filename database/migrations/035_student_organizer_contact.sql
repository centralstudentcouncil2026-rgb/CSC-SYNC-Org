begin;

-- Contact lookup is limited to an approved Public schedule.
create or replace function public.student_organizer_contact(p_event_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'phone', coalesce(nullif(btrim(p.phone), ''),
      nullif(btrim(e.contact_number_snapshot), ''), '')
  )
  from public.events e
  join public.profiles p on p.account_id = e.owner_account_id
  where e.id = p_event_id
    and e.status = 'approved'
    and e.visibility = 'public';
$$;

revoke all on function public.student_organizer_contact(uuid) from public;
grant execute on function public.student_organizer_contact(uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
commit;
