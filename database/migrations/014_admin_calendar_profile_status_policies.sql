drop policy if exists "profiles staff update any account" on profiles;
drop policy if exists "official statuses public read" on official_statuses;
drop policy if exists "official statuses staff write" on official_statuses;

alter table official_statuses enable row level security;

create policy "profiles staff update any account"
on profiles for update
using (public.is_reviewer())
with check (public.is_reviewer());

create policy "official statuses public read"
on official_statuses for select
using (true);

create policy "official statuses staff write"
on official_statuses for all
using (public.is_reviewer())
with check (public.is_reviewer());
