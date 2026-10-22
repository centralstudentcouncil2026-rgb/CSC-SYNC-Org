begin;

alter table public.profiles
  add column if not exists messenger_url text not null default '';

create or replace function public.validate_personal_communication_contact()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  profile_phone text;
  profile_messenger text;
begin
  if new.category not in ('Study time', 'Personal Time') then return new; end if;
  if new.details->>'availability' = 'dnd' then
    new.details := jsonb_build_object('availability', 'dnd');
    return new;
  end if;
  if new.details->>'availability' = 'available' then
    if new.details->>'communication_mode' = 'Both' then
      select p.phone, p.messenger_url into profile_phone, profile_messenger
      from public.profiles p where p.account_id = new.owner_account_id;
      if coalesce(regexp_replace(profile_phone, '[[:space:]().-]', '', 'g'), '')
        !~ '^\+?[0-9]{6,15}$' and coalesce(btrim(profile_messenger), '') = '' then
        raise exception 'Add a phone number or Messenger link to your profile first.';
      end if;
      new.details := jsonb_build_object(
        'availability', 'available', 'communication_mode', 'Both'
      );
    else
      -- Existing schedules and older clients remain compatible.
      if coalesce(new.details->>'communication_mode', '') not in ('Phone', 'Messenger')
        or nullif(btrim(new.details->>'communication_contact'), '') is null
        or length(new.details->>'communication_contact') > 500 then
        raise exception 'Provide valid contact details or use automatic profile contacts.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_personal_communication_contact()
from public, anon, authenticated;
drop trigger if exists validate_personal_communication_contact on public.personal_schedules;
create trigger validate_personal_communication_contact
before insert or update on public.personal_schedules
for each row execute function public.validate_personal_communication_contact();

create or replace function public.personal_schedule_contact(p_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'schedule_id', s.id,
    'phone', coalesce(nullif(btrim(p.phone), ''),
      case when s.details->>'communication_mode' = 'Phone'
        then nullif(btrim(s.details->>'communication_contact'), '') end, ''),
    'messenger_url', coalesce(nullif(btrim(p.messenger_url), ''),
      case when s.details->>'communication_mode' = 'Messenger' then
        case when s.details->>'communication_contact' ~ '^https://'
          then s.details->>'communication_contact'
        when s.details->>'communication_contact' ~ '^@?[a-zA-Z0-9._-]+$'
          then 'https://m.me/' || regexp_replace(s.details->>'communication_contact', '^@', '')
        end
      end, '')
  )
  from public.personal_schedules s
  join public.profiles p on p.account_id = s.owner_account_id
  where s.id = p_id
    and s.category in ('Study time', 'Personal Time')
    and s.details->>'availability' = 'available'
    and exists (select 1 from public.profiles viewer
      where viewer.account_id = auth.uid() and viewer.active);
$$;
revoke all on function public.personal_schedule_contact(uuid) from public, anon;
grant execute on function public.personal_schedule_contact(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
