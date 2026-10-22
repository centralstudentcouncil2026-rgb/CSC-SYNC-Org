-- Run after 026_admin_registration.sql. Also supports its original functions.
begin;

alter table public.profiles
  add column if not exists council_name text not null default '';
grant update (council_name) on public.profiles to authenticated;

create or replace function public.normalize_admin_council_profile()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  metadata jsonb;
  requested_council text;
begin
  select raw_user_meta_data into metadata from auth.users
  where id = new.account_id;
  select csc_council into requested_council
  from public.admin_registration_requests where account_id = new.account_id;

  if exists (
    select 1 from public.staff_roles
    where user_id = new.account_id and role::text = 'administrator'
  ) or requested_council is not null
    or (tg_op = 'INSERT' and metadata->>'account_type' = 'administrator') then
    new.council_name := coalesce(
      nullif(btrim(new.council_name), ''),
      nullif(btrim(requested_council), ''),
      nullif(btrim(metadata->>'council_name'), ''),
      nullif(btrim(metadata->>'csc_council'), ''),
      case when lower(btrim(new.organization_name)) <> 'central student council'
        then nullif(btrim(new.organization_name), '') end,
      ''
    );
    if length(new.council_name) > 200 then
      raise exception 'Council Name must be 200 characters or fewer.';
    end if;
    new.organization_name := 'Central Student Council';
  else
    new.council_name := '';
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_admin_council_profile()
from public, anon, authenticated;

drop trigger if exists normalize_admin_council_profile on public.profiles;
create trigger normalize_admin_council_profile
before insert or update on public.profiles
for each row execute function public.normalize_admin_council_profile();

-- Preserve earlier council values while fixing the organization.
update public.profiles p set updated_at = now()
where exists (
  select 1 from public.staff_roles
  where user_id = p.account_id and role::text = 'administrator'
) or exists (
  select 1 from public.admin_registration_requests where account_id = p.account_id
);

notify pgrst, 'reload schema';
commit;
