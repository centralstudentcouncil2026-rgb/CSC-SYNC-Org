-- Repair installations that failed migration 028 because this table was absent.
-- Run migration 028 again after this setup completes.
begin;

do $$
begin
  if to_regtype('public.revision_status') is null then
    create type public.revision_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
  end if;
end;
$$;

create table if not exists public.booking_revisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.room_bookings(id) on delete restrict,
  base_version integer not null,
  proposed_values jsonb not null,
  status public.revision_status not null default 'pending',
  reviewer_id uuid references public.profiles(account_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  request_type text not null default 'edit' check (request_type in ('edit', 'cancellation')),
  requester_id uuid references public.profiles(account_id)
);

alter table public.booking_revisions
  add column if not exists request_type text not null default 'edit';
alter table public.booking_revisions
  add column if not exists requester_id uuid references public.profiles(account_id);

alter table public.booking_revisions enable row level security;
grant select on public.booking_revisions to authenticated;

notify pgrst, 'reload schema';
commit;
