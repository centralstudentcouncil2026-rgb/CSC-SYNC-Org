drop policy if exists "events owner request edit" on events;
drop policy if exists "event series owner update" on event_series;
drop policy if exists "event occurrences owner update" on event_occurrences;

create policy "events owner request edit"
on events for update
using (owner_account_id = auth.uid() and status = 'approved')
with check (owner_account_id = auth.uid() and status = 'pending');

create policy "event series owner update"
on event_series for update
using (
  exists (
    select 1
    from events e
    where e.id = event_series.event_id
      and e.owner_account_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from events e
    where e.id = event_series.event_id
      and e.owner_account_id = auth.uid()
  )
);

create policy "event occurrences owner update"
on event_occurrences for update
using (
  exists (
    select 1
    from events e
    where e.id = event_occurrences.event_id
      and e.owner_account_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from events e
    where e.id = event_occurrences.event_id
      and e.owner_account_id = auth.uid()
  )
);
