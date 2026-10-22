-- CSC SYNC initial Supabase/PostgreSQL schema draft.
-- Based on the CSC SYNC AI Implementation Guide v1.3.

create extension if not exists "pgcrypto";

create type app_role as enum ('registered', 'reviewer', 'administrator');
create type event_status as enum ('draft', 'pending', 'changes_requested', 'approved', 'rejected', 'cancelled');
create type event_visibility as enum ('public', 'internal');
create type revision_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type booking_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled');
create type concern_status as enum ('open', 'in_progress', 'awaiting_response', 'resolved');
create type announcement_status as enum ('draft', 'published', 'archived');

create table profiles (
  account_id uuid primary key references auth.users(id) on delete restrict,
  officer_name text not null,
  organization_name text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(account_id) on delete restrict,
  role app_role not null,
  review_scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table account_change_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references profiles(account_id) on delete restrict,
  previous_login_identifier text not null,
  proposed_login_identifier text not null,
  status revision_status not null default 'pending',
  reviewer_id uuid references profiles(account_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table events (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references profiles(account_id) on delete restrict,
  creator_account_id uuid not null references profiles(account_id) on delete restrict,
  title text not null,
  category text not null check (category in ('Worship', 'Gathering', 'Outreach', 'Others')),
  other_category_detail text,
  venue text not null,
  visibility event_visibility not null,
  public_description text not null,
  purpose text not null,
  contact_person_snapshot text not null,
  contact_number_snapshot text not null,
  status event_status not null default 'draft',
  version integer not null default 1,
  school_year text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint other_category_required check (
    category <> 'Others' or nullif(trim(other_category_detail), '') is not null
  )
);

create table event_series (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  timezone text not null default 'Asia/Manila',
  frequency text not null check (frequency in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  recurrence_rule jsonb not null default '{}'::jsonb,
  local_start_template timestamp not null,
  local_end_template timestamp not null,
  repeat_until date,
  parent_series_id uuid references event_series(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint event_series_valid_duration check (local_end_template > local_start_template)
);

create table event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  series_id uuid references event_series(id) on delete restrict,
  original_occurrence_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  exception_type text,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint event_occurrence_valid_duration check (ends_at > starts_at)
);

create table event_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete restrict,
  base_version integer not null,
  request_type text not null check (request_type in ('edit', 'cancellation')),
  previous_values jsonb not null,
  proposed_values jsonb not null,
  requester_id uuid not null references profiles(account_id) on delete restrict,
  request_version integer not null default 1,
  status revision_status not null default 'pending',
  reviewer_id uuid references profiles(account_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity integer,
  operating_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into rooms (name) values ('CSC Conference Room') on conflict do nothing;

create table room_bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete restrict,
  owner_account_id uuid not null references profiles(account_id) on delete restrict,
  creator_account_id uuid not null references profiles(account_id) on delete restrict,
  selected_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  frequency text not null check (frequency in ('none', 'weekly', 'monthly', 'yearly')),
  repeat_until_month integer,
  repeat_until_year integer,
  repeat_until_resolved date,
  status booking_status not null default 'pending',
  version integer not null default 1,
  recurring_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_booking_valid_duration check (ends_at > starts_at)
);

create table booking_revisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references room_bookings(id) on delete restrict,
  base_version integer not null,
  proposed_values jsonb not null,
  status revision_status not null default 'pending',
  reviewer_id uuid references profiles(account_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table room_blackouts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint room_blackout_valid_duration check (ends_at > starts_at)
);

create table concerns (
  id uuid primary key default gen_random_uuid(),
  submitter_account_id uuid not null references profiles(account_id) on delete restrict,
  category text not null,
  title text not null,
  description text not null,
  related_event_id uuid references events(id) on delete restrict,
  related_booking_id uuid references room_bookings(id) on delete restrict,
  status concern_status not null default 'open',
  assignee_id uuid references profiles(account_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table concern_messages (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references concerns(id) on delete restrict,
  author_id uuid not null references profiles(account_id) on delete restrict,
  body text not null,
  visibility text not null check (visibility in ('submitter', 'staff')),
  created_at timestamptz not null default now()
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null,
  parent_id uuid not null,
  storage_object_key text not null,
  uploader_id uuid not null references profiles(account_id) on delete restrict,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_account_id uuid not null references profiles(account_id) on delete restrict,
  source_action_id uuid,
  target_type text not null,
  target_id uuid not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(account_id) on delete restrict,
  title text not null,
  body text not null,
  audience text not null check (audience in ('registered', 'public')),
  publish_starts_at timestamptz,
  publish_ends_at timestamptz,
  status announcement_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table official_statuses (
  id uuid primary key default gen_random_uuid(),
  role text not null unique,
  official_user_id uuid references profiles(account_id) on delete restrict,
  display_name text not null,
  availability_state text not null,
  note text,
  contact text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table approval_actions (
  id uuid primary key default gen_random_uuid(),
  reviewed_entity_type text not null,
  reviewed_entity_id uuid not null,
  submitted_version integer not null,
  reviewer_id uuid not null references profiles(account_id) on delete restrict,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(account_id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_values jsonb,
  after_values jsonb,
  created_at timestamptz not null default now()
);

create index events_owner_idx on events(owner_account_id);
create index events_status_idx on events(status);
create index occurrences_range_idx on event_occurrences(starts_at, ends_at);
create index room_bookings_owner_idx on room_bookings(owner_account_id);
create index room_bookings_range_idx on room_bookings(room_id, starts_at, ends_at);
create index concerns_submitter_idx on concerns(submitter_account_id);
create index concerns_assignee_idx on concerns(assignee_id);
create index notifications_unread_idx on notifications(recipient_account_id, read_at);

alter table profiles enable row level security;
alter table staff_roles enable row level security;
alter table events enable row level security;
alter table event_series enable row level security;
alter table event_occurrences enable row level security;
alter table event_revisions enable row level security;
alter table room_bookings enable row level security;
alter table concerns enable row level security;
alter table concern_messages enable row level security;
alter table notifications enable row level security;
alter table announcements enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_roles
    where user_id = auth.uid() and role = 'administrator'
  );
$$;

create or replace function public.is_reviewer()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_roles
    where user_id = auth.uid() and role in ('reviewer', 'administrator')
  );
$$;

create policy "profiles read own or staff"
on profiles for select
using (account_id = auth.uid() or public.is_reviewer());

create policy "profiles update own basic fields"
on profiles for update
using (account_id = auth.uid())
with check (account_id = auth.uid());

create policy "events owner full read"
on events for select
using (owner_account_id = auth.uid() or public.is_reviewer());

create policy "events limited registered read"
on events for select
using (
  auth.uid() is not null
  and status in ('pending', 'changes_requested', 'approved', 'cancelled')
);

create policy "events owner insert"
on events for insert
with check (owner_account_id = auth.uid() and creator_account_id = auth.uid());

create policy "events owner update unapproved"
on events for update
using (owner_account_id = auth.uid() and status in ('draft', 'pending', 'changes_requested'))
with check (owner_account_id = auth.uid());

create policy "event revisions owner insert"
on event_revisions for insert
with check (requester_id = auth.uid());

create policy "room bookings owner read"
on room_bookings for select
using (owner_account_id = auth.uid() or public.is_reviewer());

create policy "room bookings registered read approved"
on room_bookings for select
using (auth.uid() is not null and status = 'approved');

create policy "room bookings owner insert"
on room_bookings for insert
with check (owner_account_id = auth.uid() and creator_account_id = auth.uid());

create policy "concerns submitter or staff read"
on concerns for select
using (submitter_account_id = auth.uid() or assignee_id = auth.uid() or public.is_reviewer());

create policy "concerns submitter insert"
on concerns for insert
with check (submitter_account_id = auth.uid());

create policy "notifications own read"
on notifications for select
using (recipient_account_id = auth.uid());

create policy "announcements registered read"
on announcements for select
using (auth.uid() is not null and status = 'published' and audience in ('registered', 'public'));

create or replace view public.public_calendar_events as
select
  e.id,
  e.title,
  p.organization_name,
  e.category,
  e.venue,
  e.public_description,
  o.starts_at,
  o.ends_at,
  e.status
from events e
join profiles p on p.account_id = e.owner_account_id
join event_occurrences o on o.event_id = e.id
where e.status = 'approved'
  and e.visibility = 'public';
