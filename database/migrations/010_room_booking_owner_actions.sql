drop policy if exists "room bookings owner update own booking" on room_bookings;
drop policy if exists "room bookings owner delete own booking" on room_bookings;

create policy "room bookings owner update own booking"
on room_bookings for update
using (owner_account_id = auth.uid())
with check (
  owner_account_id = auth.uid()
  and creator_account_id = auth.uid()
  and status in ('pending', 'approved')
);

create policy "room bookings owner delete own booking"
on room_bookings for delete
using (owner_account_id = auth.uid());
