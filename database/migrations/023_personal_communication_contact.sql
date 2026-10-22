begin;

create or replace function public.validate_personal_communication_contact()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.category in ('Study time', 'Personal Time')
     and new.details->>'availability' = 'available' then
    if coalesce(new.details->>'communication_mode', '') not in ('Phone', 'Messenger') then
      raise exception 'Choose Phone or Messenger as the mode of communication.';
    end if;
    if nullif(btrim(new.details->>'communication_contact'), '') is null then
      raise exception 'Enter a phone number or Messenger account for the selected mode.';
    end if;
    if length(new.details->>'communication_contact') > 500 then
      raise exception 'Contact details must be 500 characters or fewer.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_personal_communication_contact()
from public, anon, authenticated;

drop trigger if exists validate_personal_communication_contact
on public.personal_schedules;

create trigger validate_personal_communication_contact
before insert or update on public.personal_schedules
for each row execute function public.validate_personal_communication_contact();

notify pgrst, 'reload schema';
commit;
