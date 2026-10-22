begin;

alter table public.personal_schedules
  drop constraint if exists personal_schedules_category_check;
alter table public.personal_schedules
  add constraint personal_schedules_category_check check (
    category in ('Class', 'Meeting', 'Study time', 'Personal Time',
      'Worship', 'Free time', 'On duty', 'Others')
  );

create or replace function public.validate_on_duty_location()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.category = 'On duty' and (
    nullif(btrim(new.details->>'location'), '') is null
    or length(new.details->>'location') > 500
  ) then
    raise exception 'Enter an On duty location (up to 500 characters).';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_on_duty_location()
from public, anon, authenticated;
drop trigger if exists validate_on_duty_location on public.personal_schedules;
create trigger validate_on_duty_location
before insert or update on public.personal_schedules
for each row execute function public.validate_on_duty_location();

create or replace function public.official_personal_room(p_office text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  candidates uuid[];
  official_id uuid;
  names text[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where account_id = auth.uid() and active
  ) then
    raise exception 'Sign in with an active account.';
  end if;
  if p_office = 'president' then
    names := array['csc president', 'president'];
  elsif p_office = 'adviser' then
    names := array['csc adviser', 'adviser', 'csc advisor', 'advisor'];
  else
    raise exception 'Unknown CSC office.';
  end if;

  select array_agg(p.account_id) into candidates
  from public.profiles p
  where p.active and exists (
    select 1 from public.staff_roles r
    where r.user_id = p.account_id and r.role::text = 'administrator'
  ) and (
    lower(regexp_replace(btrim(p.council_name), '\s+', ' ', 'g')) = any(names)
    or lower(regexp_replace(btrim(p.officer_name), '\s+', ' ', 'g')) = any(names)
  );
  if coalesce(cardinality(candidates), 0) <> 1 then
    return jsonb_build_object('state', case when cardinality(candidates) > 1
      then 'ambiguous' else 'not_configured' end);
  end if;
  official_id := candidates[1];
  return jsonb_build_object(
    'state', 'ready',
    'official', (select jsonb_build_object('id', p.account_id, 'phone', p.phone)
      from public.profiles p where p.account_id = official_id),
    'schedules', (select coalesce(jsonb_agg(to_jsonb(s) order by s.selected_date, s.start_time), '[]'::jsonb)
      from public.personal_schedules s where s.owner_account_id = official_id)
  );
end;
$$;
revoke all on function public.official_personal_room(text) from public, anon;
grant execute on function public.official_personal_room(text) to authenticated;

notify pgrst, 'reload schema';
commit;
