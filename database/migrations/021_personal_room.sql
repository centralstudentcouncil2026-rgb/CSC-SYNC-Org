begin;

create table if not exists public.personal_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.profiles(account_id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  category text not null check (category in ('Class', 'Meeting', 'Study time', 'Personal Time', 'Worship', 'Free time', 'Others')),
  details jsonb not null default '{}'::jsonb,
  selected_date date not null,
  start_time time not null,
  end_time time not null,
  frequency text not null default 'none' check (frequency in ('none', 'weekly', 'monthly', 'yearly')),
  repeat_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (frequency = 'none' or (repeat_until is not null and repeat_until >= selected_date))
);

create index if not exists personal_schedules_owner_date_idx
on public.personal_schedules(owner_account_id, selected_date);

alter table public.personal_schedules enable row level security;
revoke all on public.personal_schedules from public, anon, authenticated;
grant select, insert, delete on public.personal_schedules to authenticated;
grant update (title, category, details, selected_date, start_time, end_time, frequency, repeat_until, updated_at)
on public.personal_schedules to authenticated;

drop policy if exists "personal schedules read" on public.personal_schedules;
create policy "personal schedules read" on public.personal_schedules
for select to authenticated using (true);

drop policy if exists "personal schedules create own" on public.personal_schedules;
create policy "personal schedules create own" on public.personal_schedules
for insert to authenticated with check (owner_account_id = auth.uid());

drop policy if exists "personal schedules update own" on public.personal_schedules;
create policy "personal schedules update own" on public.personal_schedules
for update to authenticated using (owner_account_id = auth.uid())
with check (owner_account_id = auth.uid());

drop policy if exists "personal schedules delete own" on public.personal_schedules;
create policy "personal schedules delete own" on public.personal_schedules
for delete to authenticated using (owner_account_id = auth.uid());

-- A limited directory for the user filter; no contact or login data is exposed.
create or replace function public.personal_room_users()
returns table(account_id uuid, display_name text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.account_id,
    coalesce(nullif(p.officer_name, ''), nullif(p.organization_name, ''), 'User')::text
  from public.profiles p
  where p.active = true
  order by 2, p.account_id;
$$;
revoke all on function public.personal_room_users() from public, anon;
grant execute on function public.personal_room_users() to authenticated;

notify pgrst, 'reload schema';
commit;
