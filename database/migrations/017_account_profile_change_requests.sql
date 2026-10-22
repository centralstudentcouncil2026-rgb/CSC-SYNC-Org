-- Run in the Supabase SQL Editor for the project used by src/services/supabase.js.
-- Repairs a missing table and upgrades installations with the original table.
begin;

create table if not exists public.account_change_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(account_id) on delete restrict,
  previous_login_identifier text not null,
  proposed_login_identifier text not null,
  previous_values jsonb not null default '{}'::jsonb,
  proposed_values jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewer_id uuid references public.profiles(account_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.account_change_requests
  add column if not exists previous_values jsonb not null default '{}'::jsonb,
  add column if not exists proposed_values jsonb not null default '{}'::jsonb;

create index if not exists account_change_requests_account_idx
  on public.account_change_requests(account_id, created_at desc);
create index if not exists account_change_requests_pending_idx
  on public.account_change_requests(status, created_at desc);

alter table public.account_change_requests enable row level security;
revoke all on public.account_change_requests from anon;
grant select, insert, update on public.account_change_requests to authenticated;

drop policy if exists "account requests owner or staff read" on public.account_change_requests;
create policy "account requests owner or staff read"
on public.account_change_requests for select to authenticated
using (account_id = auth.uid() or public.is_reviewer());

drop policy if exists "account requests owner submit pending" on public.account_change_requests;
create policy "account requests owner submit pending"
on public.account_change_requests for insert to authenticated
with check (
  account_id = auth.uid()
  and status = 'pending'
  and reviewer_id is null
  and decided_at is null
);

drop policy if exists "account requests staff review" on public.account_change_requests;
create policy "account requests staff review"
on public.account_change_requests for update to authenticated
using (public.is_reviewer() and status = 'pending')
with check (public.is_reviewer());

-- Approval and the profile update succeed or roll back together.
-- Account login/email changes are deliberately outside this profile-only flow.
create or replace function public.review_account_profile_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proposed_profile jsonb;
begin
  if not public.is_reviewer() then
    raise exception 'Only authorized staff can review profile changes.';
  end if;

  if old.status <> 'pending' then
    raise exception 'This profile request has already been reviewed.';
  end if;

  if new.id is distinct from old.id
    or new.account_id is distinct from old.account_id
    or new.previous_login_identifier is distinct from old.previous_login_identifier
    or new.proposed_login_identifier is distinct from old.proposed_login_identifier
    or new.previous_values is distinct from old.previous_values
    or new.proposed_values is distinct from old.proposed_values
    or new.created_at is distinct from old.created_at then
    raise exception 'Submitted profile request details cannot be changed during review.';
  end if;

  if new.status not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected when reviewing a profile request.';
  end if;

  new.reviewer_id := auth.uid();
  new.decided_at := now();

  if new.status = 'approved' then
    if new.proposed_login_identifier is distinct from new.previous_login_identifier then
      raise exception 'Login changes require a separate authentication update.';
    end if;
    proposed_profile := new.proposed_values -> 'profile';
    if jsonb_typeof(proposed_profile) is distinct from 'object'
      or jsonb_typeof(proposed_profile -> 'officer_name') is distinct from 'string'
      or jsonb_typeof(proposed_profile -> 'organization_name') is distinct from 'string'
      or jsonb_typeof(proposed_profile -> 'phone') is distinct from 'string' then
      raise exception 'This request does not contain valid profile changes.';
    end if;

    update public.profiles
    set officer_name = proposed_profile ->> 'officer_name',
        organization_name = proposed_profile ->> 'organization_name',
        phone = proposed_profile ->> 'phone',
        updated_at = now()
    where account_id = new.account_id;

    if not found then
      raise exception 'The requested profile no longer exists.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.review_account_profile_request() from public, anon, authenticated;
drop trigger if exists review_account_profile_request on public.account_change_requests;
create trigger review_account_profile_request
before update on public.account_change_requests
for each row execute function public.review_account_profile_request();

-- Ask PostgREST to discover the newly created table and columns after commit.
notify pgrst, 'reload schema';
commit;
