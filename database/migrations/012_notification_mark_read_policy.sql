drop policy if exists "notifications own mark read" on notifications;

create policy "notifications own mark read"
on notifications for update
using (recipient_account_id = auth.uid())
with check (recipient_account_id = auth.uid());
