begin;

alter table public.profiles add column if not exists council_name text not null default '';
grant update (council_name) on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.staff_roles
    where user_id = auth.uid() and role::text = 'administrator');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.admin_registration_requests (
  account_id uuid primary key references public.profiles(account_id) on delete cascade,
  email text not null,
  officer_name text not null,
  csc_council text not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references public.profiles(account_id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.admin_registration_requests enable row level security;
revoke all on public.admin_registration_requests from public, anon, authenticated;
grant select on public.admin_registration_requests to authenticated;
drop policy if exists "admin registrations read" on public.admin_registration_requests;
create policy "admin registrations read" on public.admin_registration_requests
for select to authenticated using (account_id = auth.uid() or public.is_admin());

-- Role changes are performed by the approval function, never public signup.
revoke insert, update on public.staff_roles from public, anon, authenticated;
grant select on public.staff_roles to authenticated;
drop policy if exists "staff roles registration read" on public.staff_roles;
create policy "staff roles registration read" on public.staff_roles
for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.capture_admin_registration()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  officer text := btrim(new.raw_user_meta_data->>'officer_name');
  council text := btrim(new.raw_user_meta_data->>'csc_council');
  contact text := btrim(new.raw_user_meta_data->>'phone');
begin
  if coalesce(new.raw_user_meta_data->>'account_type', '') <> 'administrator' then
    return new;
  end if;
  if nullif(officer, '') is null or nullif(council, '') is null
     or nullif(contact, '') is null or nullif(new.email, '') is null
     or length(officer) > 200 or length(council) > 200 or length(contact) > 80 then
    raise exception 'Complete the officer name, CSC Council, email and phone fields.';
  end if;
  insert into public.profiles(account_id, officer_name, organization_name, council_name, phone, active)
  values (new.id, officer, 'Central Student Council', council, contact, false)
  on conflict (account_id) do update set
    officer_name = excluded.officer_name, organization_name = excluded.organization_name,
    council_name = excluded.council_name,
    phone = excluded.phone, active = false, updated_at = now();

  insert into public.admin_registration_requests(account_id, email, officer_name, csc_council, phone)
  values (new.id, lower(new.email), officer, council, contact);
  return new;
end;
$$;
revoke all on function public.capture_admin_registration() from public, anon, authenticated;
drop trigger if exists zz_csc_capture_admin_registration on auth.users;
create trigger zz_csc_capture_admin_registration
after insert on auth.users for each row execute function public.capture_admin_registration();

create or replace function public.admin_registration_ready()
returns boolean language sql stable
set search_path = public, pg_temp
as $$ select true; $$;
revoke all on function public.admin_registration_ready() from public;
grant execute on function public.admin_registration_ready() to anon, authenticated;

create or replace function public.review_admin_registration(p_account_id uuid, p_approve boolean)
returns public.admin_registration_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  request public.admin_registration_requests;
begin
  if auth.uid() is null or not public.is_admin() or not exists (
    select 1 from public.profiles where account_id = auth.uid() and active = true
  ) then
    raise exception 'Only an active administrator can review admin signups.';
  end if;
  if p_account_id = auth.uid() then
    raise exception 'You cannot approve your own admin request.';
  end if;
  if p_approve is null then raise exception 'Choose approve or reject.'; end if;

  select * into request from public.admin_registration_requests
  where account_id = p_account_id for update;
  if not found or request.status <> 'pending' then
    raise exception 'This admin request is no longer pending. Refresh the page.';
  end if;
  if p_approve then
    if not exists (select 1 from auth.users where id = p_account_id and lower(email) = lower(request.email)) then
      raise exception 'The signup email changed. Review the current account before granting admin access.';
    end if;
    update public.profiles set officer_name = request.officer_name,
      organization_name = 'Central Student Council', council_name = request.csc_council, phone = request.phone,
      active = true, updated_at = now()
    where account_id = p_account_id;
    insert into public.staff_roles(user_id, role)
    values (p_account_id, 'administrator') on conflict (user_id, role) do nothing;
  else
    update public.profiles set active = false, updated_at = now()
    where account_id = p_account_id;
  end if;

  update public.admin_registration_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewer_id = auth.uid(), decided_at = now()
  where account_id = p_account_id returning * into request;
  return request;
end;
$$;
revoke all on function public.review_admin_registration(uuid, boolean) from public, anon;
grant execute on function public.review_admin_registration(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
