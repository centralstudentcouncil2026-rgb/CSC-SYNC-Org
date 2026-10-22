begin;

-- Organization viewers need admin IDs for the CSC filter, not private profiles.
create or replace function public.calendar_admin_accounts()
returns table (account_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct r.user_id
  from public.staff_roles r
  where r.role::text = 'administrator'
    and exists (
      select 1 from public.profiles viewer
      where viewer.account_id = auth.uid() and viewer.active
    );
$$;

revoke all on function public.calendar_admin_accounts() from public, anon;
grant execute on function public.calendar_admin_accounts() to authenticated;

notify pgrst, 'reload schema';
commit;
