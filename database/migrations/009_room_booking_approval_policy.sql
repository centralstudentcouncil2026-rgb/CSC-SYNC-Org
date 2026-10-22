drop policy if exists "room bookings staff approve" on room_bookings;

create policy "room bookings staff approve"
on room_bookings for update
using (public.is_reviewer())
with check (public.is_reviewer());
