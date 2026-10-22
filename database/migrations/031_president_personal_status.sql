begin;

-- Identify the office by an active administrator profile, never a fixed email.
create or replace function public.president_personal_room()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  candidates uuid[];
  president uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where account_id = auth.uid() and active
  ) then
    raise exception 'Sign in with an active account.';
  end if;

  select array_agg(p.account_id) into candidates
  from public.profiles p
  where p.active and exists (
    select 1 from public.staff_roles r
    where r.user_id = p.account_id and r.role::text = 'administrator'
  ) and (
    lower(regexp_replace(btrim(p.council_name), '\s+', ' ', 'g')) in ('csc president', 'president')
    or lower(regexp_replace(btrim(p.officer_name), '\s+', ' ', 'g')) in ('csc president', 'president')
  );

  if coalesce(cardinality(candidates), 0) <> 1 then
    return jsonb_build_object('state', case when cardinality(candidates) > 1
      then 'ambiguous' else 'not_configured' end);
  end if;
  president := candidates[1];
  return jsonb_build_object(
    'state', 'ready',
    'president', (select jsonb_build_object('id', p.account_id, 'phone', p.phone)
      from public.profiles p where p.account_id = president),
    'schedules', (select coalesce(jsonb_agg(to_jsonb(s) order by s.selected_date, s.start_time), '[]'::jsonb)
      from public.personal_schedules s where s.owner_account_id = president)
  );
end;
$$;
revoke all on function public.president_personal_room() from public, anon;
grant execute on function public.president_personal_room() to authenticated;

notify pgrst, 'reload schema';
commit;
