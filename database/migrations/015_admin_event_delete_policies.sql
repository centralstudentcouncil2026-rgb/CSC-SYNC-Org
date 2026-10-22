drop policy if exists "events staff delete" on events;
drop policy if exists "event series staff delete" on event_series;
drop policy if exists "event occurrences staff delete" on event_occurrences;
drop policy if exists "event revisions staff delete any" on event_revisions;
drop policy if exists "notifications staff cleanup event notifications" on notifications;

create policy "events staff delete"
on events for delete
using (public.is_reviewer());

create policy "event series staff delete"
on event_series for delete
using (public.is_reviewer());

create policy "event occurrences staff delete"
on event_occurrences for delete
using (public.is_reviewer());

create policy "event revisions staff delete any"
on event_revisions for delete
using (public.is_reviewer());

create policy "notifications staff cleanup event notifications"
on notifications for delete
using (public.is_reviewer());
