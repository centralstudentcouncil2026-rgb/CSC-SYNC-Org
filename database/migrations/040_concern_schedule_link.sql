begin;

-- Older concern tables may predate the optional calendar-schedule link.
-- The deletion RPC clears this link while preserving the concern itself.
alter table public.concerns
  add column if not exists related_event_id uuid
  references public.events(id) on delete restrict;

notify pgrst, 'reload schema';
commit;
