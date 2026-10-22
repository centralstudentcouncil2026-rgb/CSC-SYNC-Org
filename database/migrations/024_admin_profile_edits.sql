begin;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff_roles r
    where r.user_id = auth.uid() and r.role::text = 'administrator'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (officer_name, organization_name, phone, updated_at)
on public.profiles to authenticated;

drop policy if exists "profiles admin read accounts" on public.profiles;
create policy "profiles admin read accounts"
on public.profiles for select to authenticated
using (public.is_admin());

drop policy if exists "profiles admin edit accounts" on public.profiles;
create policy "profiles admin edit accounts"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
commit;
