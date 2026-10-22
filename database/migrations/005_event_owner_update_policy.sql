drop policy if exists "events owner update unapproved" on events;
drop policy if exists "events owner request edit" on events;
drop policy if exists "events owner update own schedule" on events;

create policy "events owner update own schedule"
on events for update
using (
  owner_account_id = auth.uid()
  and status in ('draft', 'pending', 'changes_requested', 'approved')
)
with check (
  owner_account_id = auth.uid()
  and creator_account_id = auth.uid()
  and status in ('draft', 'pending', 'changes_requested')
);
