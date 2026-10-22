drop policy if exists "event series owner read" on event_series;
drop policy if exists "event series owner insert" on event_series;
drop policy if exists "event occurrences owner read" on event_occurrences;
drop policy if exists "event occurrences owner insert" on event_occurrences;

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
        or (auth.uid() is not null and e.status = 'approved')
      )
  )
);

create policy "event series owner insert"
on event_series for insert
with check (
  exists (
    select 1
    from events e
    where e.id = event_series.event_id
      and e.owner_account_id = auth.uid()
      and e.creator_account_id = auth.uid()
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
        or (auth.uid() is not null and e.status = 'approved')
      )
  )
);

create policy "event occurrences owner insert"
on event_occurrences for insert
with check (
  exists (
    select 1
    from events e
    where e.id = event_occurrences.event_id
      and e.owner_account_id = auth.uid()
      and e.creator_account_id = auth.uid()
  )
);
