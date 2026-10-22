drop policy if exists "event series owner read" on event_series;
drop policy if exists "event occurrences owner read" on event_occurrences;
drop policy if exists "room bookings registered read visible" on room_bookings;

create policy "event series owner read"
on event_series for select
using (
  exists (
    select 1
    from events e
    where e.id = event_series.event_id
      and (
        e.owner_account_id = auth.uid()
        or public.is_reviewer()
        or (
          auth.uid() is not null
          and e.status in ('pending', 'changes_requested', 'approved', 'cancelled')
        )
      )
  )
);

create policy "event occurrences owner read"
on event_occurrences for select
using (
  exists (
    select 1
    from events e
    where e.id = event_occurrences.event_id
      and (
        e.owner_account_id = auth.uid()
        or public.is_reviewer()
        or (
          auth.uid() is not null
          and e.status in ('pending', 'changes_requested', 'approved', 'cancelled')
        )
      )
  )
);

create policy "room bookings registered read visible"
on room_bookings for select
using (
  auth.uid() is not null
  and status in ('pending', 'approved')
);
