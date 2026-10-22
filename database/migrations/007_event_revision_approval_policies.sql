drop policy if exists "event revisions owner or staff read" on event_revisions;
drop policy if exists "event revisions owner insert" on event_revisions;
drop policy if exists "event revisions staff update" on event_revisions;
drop policy if exists "events staff approve" on events;

create policy "event revisions owner or staff read"
on event_revisions for select
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

create policy "event revisions owner insert"
on event_revisions for insert
with check (requester_id = auth.uid());

create policy "event revisions staff update"
on event_revisions for update
using (public.is_reviewer())
with check (public.is_reviewer());

create policy "events staff approve"
on events for update
using (public.is_reviewer())
with check (public.is_reviewer());
