-- Repair existing announcement tables created without publication timestamps.
begin;

alter table public.announcements
  add column if not exists publish_starts_at timestamptz,
  add column if not exists publish_ends_at timestamptz;

notify pgrst, 'reload schema';

commit;
