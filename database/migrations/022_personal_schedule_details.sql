begin;

alter table public.personal_schedules
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.personal_schedules
  drop constraint if exists personal_schedules_category_check;
alter table public.personal_schedules
  add constraint personal_schedules_category_check check (
    category in ('Class', 'Meeting', 'Study time', 'Personal Time', 'Worship', 'Free time', 'Others')
  );

grant update (details) on public.personal_schedules to authenticated;

create or replace function public.validate_personal_schedule_details()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  required_fields text[] := '{}';
  field_name text;
begin
  if new.details is null or jsonb_typeof(new.details) <> 'object' then
    raise exception 'Schedule details must be an object.';
  end if;

  case new.category
    when 'Class' then required_fields := array['subject', 'room'];
    when 'Meeting' then required_fields := array['meeting_title', 'location'];
    when 'Worship' then required_fields := array['location'];
    when 'Study time', 'Personal Time' then
      if coalesce(new.details->>'availability', '') not in ('dnd', 'available') then
        raise exception 'Choose DND or Can be messaged.';
      end if;
      if new.details->>'availability' = 'available' then
        required_fields := array['communication_mode'];
      end if;
    when 'Free time' then
      if coalesce(new.details->>'contact_method', '') not in ('Phone number', 'Messenger', 'Other') then
        raise exception 'Choose a contact method.';
      end if;
      required_fields := array['contact_value'];
    else null;
  end case;

  foreach field_name in array required_fields loop
    if nullif(btrim(new.details->>field_name), '') is null then
      raise exception 'Complete the required schedule field: %.', field_name;
    end if;
    if length(new.details->>field_name) > 500 then
      raise exception 'Schedule details must be 500 characters or fewer.';
    end if;
  end loop;

  if new.category = 'Class' then
    new.title := left(btrim(new.details->>'subject'), 200);
  elsif new.category = 'Meeting' then
    new.title := left(btrim(new.details->>'meeting_title'), 200);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_personal_schedule_details()
from public, anon, authenticated;
drop trigger if exists validate_personal_schedule_details on public.personal_schedules;
create trigger validate_personal_schedule_details
before insert or update on public.personal_schedules
for each row execute function public.validate_personal_schedule_details();

create table if not exists public.personal_schedule_contacts (
  owner_account_id uuid primary key references public.profiles(account_id) on delete cascade,
  phone text not null default '' check (length(phone) <= 500),
  messenger text not null default '' check (length(messenger) <= 500)
);
alter table public.personal_schedule_contacts enable row level security;
revoke all on public.personal_schedule_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.personal_schedule_contacts to authenticated;

drop policy if exists "personal contacts owner only" on public.personal_schedule_contacts;
create policy "personal contacts owner only" on public.personal_schedule_contacts
for all to authenticated
using (owner_account_id = auth.uid())
with check (owner_account_id = auth.uid());

notify pgrst, 'reload schema';
commit;
