begin;

alter table public.profiles
  add column if not exists messenger_url text not null default '';
alter table public.profiles drop constraint if exists profiles_messenger_url_check;
alter table public.profiles add constraint profiles_messenger_url_check check (
  messenger_url = '' or (
    length(messenger_url) <= 500 and messenger_url ~*
      '^https://(www[.])?(m[.]me|messenger[.]com)/[^[:space:]]+$'
  )
);
grant update (messenger_url) on public.profiles to authenticated;

-- Run after the existing profile-review trigger; approval remains atomic.
create or replace function public.apply_profile_messenger_request()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  profile_values jsonb := new.proposed_values->'profile';
begin
  if old.status = 'pending' and new.status = 'approved'
    and profile_values ? 'messenger_url' then
    if not public.is_reviewer() then
      raise exception 'Only authorized staff can approve profile changes.';
    end if;
    if jsonb_typeof(profile_values->'messenger_url') <> 'string' then
      raise exception 'Messenger link must be text.';
    end if;
    update public.profiles
    set messenger_url = btrim(profile_values->>'messenger_url'), updated_at = now()
    where account_id = new.account_id;
    if not found then raise exception 'The requested profile no longer exists.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_profile_messenger_request()
from public, anon, authenticated;
drop trigger if exists apply_profile_messenger_request on public.account_change_requests;
create trigger apply_profile_messenger_request
after update on public.account_change_requests
for each row execute function public.apply_profile_messenger_request();

create or replace function public.student_organizer_contact(p_event_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'phone', coalesce(nullif(btrim(p.phone), ''),
      nullif(btrim(e.contact_number_snapshot), ''), ''),
    'messenger_url', p.messenger_url
  )
  from public.events e
  join public.profiles p on p.account_id = e.owner_account_id
  where e.id = p_event_id and e.status = 'approved' and e.visibility = 'public';
$$;
revoke all on function public.student_organizer_contact(uuid) from public;
grant execute on function public.student_organizer_contact(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
