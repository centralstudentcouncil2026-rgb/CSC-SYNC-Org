-- Run in the Supabase SQL Editor to enable admin posting and org delivery.
begin;

-- Some deployed databases do not include the initial schema's admin helper.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff_roles r
    where r.user_id = auth.uid()
      and r.role::text = 'administrator'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(account_id) on delete restrict,
  title text not null,
  body text not null,
  audience text not null check (audience in ('registered', 'public')),
  publish_starts_at timestamptz,
  publish_ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not upgrade an existing table.
alter table public.announcements
  add column if not exists publish_starts_at timestamptz,
  add column if not exists publish_ends_at timestamptz;

alter table public.announcements enable row level security;
grant select, insert, update on public.announcements to authenticated;
drop policy if exists "announcements staff write" on public.announcements;
drop policy if exists "announcements admin manage" on public.announcements;
create policy "announcements admin manage"
on public.announcements for all to authenticated
using (public.is_admin())
with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "announcements registered read" on public.announcements;
create policy "announcements registered read"
on public.announcements for select to authenticated
using (status = 'published' and audience in ('registered', 'public'));

create index if not exists notifications_announcement_lookup_idx
on public.notifications(target_id, recipient_account_id)
where target_type = 'announcement';

create or replace function public.deliver_announcement_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' then return new; end if;
  end if;
  if not public.is_admin() or new.author_id <> auth.uid() then
    raise exception 'Only an administrator can post announcements.';
  end if;

  insert into public.notifications(recipient_account_id, target_type, target_id, message)
  select p.account_id, 'announcement', new.id, new.title || E'\n\n' || new.body
  from public.profiles p
  where p.active = true
    and p.account_id <> new.author_id
    and not exists (
      select 1 from public.staff_roles r
      where r.user_id = p.account_id and r.role in ('administrator', 'reviewer')
    )
    and not exists (
      select 1 from public.notifications n
      where n.recipient_account_id = p.account_id
        and n.target_type = 'announcement' and n.target_id = new.id
    );
  return new;
end;
$$;

revoke all on function public.deliver_announcement_notifications() from public, anon, authenticated;
drop trigger if exists deliver_announcement_notifications on public.announcements;
create trigger deliver_announcement_notifications
after insert or update of status on public.announcements
for each row execute function public.deliver_announcement_notifications();

create or replace function public.publish_announcement(p_title text, p_body text)
returns setof public.announcements
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can post announcements.';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception 'Enter an announcement title and message.';
  end if;
  if length(btrim(p_title)) > 200 or length(btrim(p_body)) > 10000 then
    raise exception 'The announcement title or message is too long.';
  end if;
  return query
  insert into public.announcements(author_id, title, body, audience, status, publish_starts_at)
  values (auth.uid(), btrim(p_title), btrim(p_body), 'registered', 'published', now())
  returning *;
end;
$$;
revoke all on function public.publish_announcement(text, text) from public, anon;
grant execute on function public.publish_announcement(text, text) to authenticated;

-- Existing posts also appear in current organization accounts' notifications.
insert into public.notifications(recipient_account_id, target_type, target_id, message)
select p.account_id, 'announcement', a.id, a.title || E'\n\n' || a.body
from public.announcements a
cross join public.profiles p
where a.status = 'published' and a.audience in ('registered', 'public')
  and p.active = true and p.account_id <> a.author_id
  and not exists (
    select 1 from public.staff_roles r
    where r.user_id = p.account_id and r.role in ('administrator', 'reviewer')
  )
  and not exists (
    select 1 from public.notifications n
    where n.recipient_account_id = p.account_id
      and n.target_type = 'announcement' and n.target_id = a.id
  );

notify pgrst, 'reload schema';
commit;
