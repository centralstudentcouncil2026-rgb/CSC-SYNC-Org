begin;

-- Restore the optional links used by delete_calendar_schedule on older schemas.
-- Existing data remains unchanged; new links start as NULL.
alter table public.concerns
  add column if not exists related_event_id uuid
  references public.events(id) on delete restrict;

alter table public.event_series
  add column if not exists parent_series_id uuid
  references public.event_series(id) on delete restrict;

notify pgrst, 'reload schema';
commit;
