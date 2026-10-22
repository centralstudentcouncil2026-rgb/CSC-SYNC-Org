begin;

create or replace function public.remove_announcement(p_announcement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an administrator can remove announcements.';
  end if;

  perform 1 from public.announcements
  where id = p_announcement_id for update;
  if not found then
    raise exception 'Announcement no longer exists. Refresh the page.';
  end if;

  delete from public.notifications
  where target_type = 'announcement' and target_id = p_announcement_id;

  delete from public.announcements where id = p_announcement_id;
  return p_announcement_id;
end;
$$;

revoke all on function public.remove_announcement(uuid) from public, anon;
grant execute on function public.remove_announcement(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
