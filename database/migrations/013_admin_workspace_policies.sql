drop policy if exists "event series staff update" on event_series;
drop policy if exists "event occurrences staff update" on event_occurrences;
drop policy if exists "concerns staff update" on concerns;
drop policy if exists "announcements staff write" on announcements;

create policy "event series staff update"
on event_series for update
using (public.is_reviewer())
with check (public.is_reviewer());

create policy "event occurrences staff update"
on event_occurrences for update
using (public.is_reviewer())
with check (public.is_reviewer());

create policy "concerns staff update"
on concerns for update
using (public.is_reviewer())
with check (public.is_reviewer());

create policy "announcements staff write"
on announcements for all
using (public.is_reviewer())
with check (public.is_reviewer());
