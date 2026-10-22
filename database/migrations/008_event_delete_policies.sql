drop policy if exists "events owner delete own schedule" on events;
drop policy if exists "event series owner delete" on event_series;
drop policy if exists "event occurrences owner delete" on event_occurrences;
drop policy if exists "event revisions owner delete" on event_revisions;
drop policy if exists "notifications owner cleanup event notifications" on notifications;

create policy "event revisions owner delete"
on event_revisions for delete
using (
  requester_id = auth.uid()
  or public.is_reviewer()
  or exists (
    select 1
    from events e
    where e.id = event_revisions.event_id
      and e.owner_account_id = auth.uid()
  )
);

create policy "event occurrences owner delete"
on event_occurrences for delete
using (
  exists (
    select 1
    from events e
    where e.id = event_occurrences.event_id
      and e.owner_account_id = auth.uid()
  )
);

create policy "event series owner delete"
on event_series for delete
using (
  exists (
    select 1
    from events e
    where e.id = event_series.event_id
      and e.owner_account_id = auth.uid()
  )
);

create policy "notifications owner cleanup event notifications"
on notifications for delete
using (
  recipient_account_id = auth.uid()
  or exists (
    select 1
    from events e
    where e.id = notifications.target_id
      and notifications.target_type = 'event'
      and e.owner_account_id = auth.uid()
  )
);

create policy "events owner delete own schedule"
on events for delete
using (owner_account_id = auth.uid());
