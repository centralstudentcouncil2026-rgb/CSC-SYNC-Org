begin;

-- Some existing installations never created the booking revision table.
do $$
begin
  if to_regtype('public.revision_status') is null then
    create type public.revision_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
  end if;
end;
$$;

create table if not exists public.booking_revisions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.room_bookings(id) on delete restrict,
  base_version integer not null,
  proposed_values jsonb not null,
  status public.revision_status not null default 'pending',
  reviewer_id uuid references public.profiles(account_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  request_type text not null default 'edit' check (request_type in ('edit', 'cancellation')),
  requester_id uuid references public.profiles(account_id)
);

alter table public.notifications add column if not exists delivery_key text;
create unique index if not exists notifications_delivery_key_unique
  on public.notifications(recipient_account_id, delivery_key) where delivery_key is not null;
alter table public.booking_revisions add column if not exists request_type text not null default 'edit';
alter table public.booking_revisions add column if not exists requester_id uuid references public.profiles(account_id);

create or replace function public.schedule_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from staff_roles r join profiles p on p.account_id=r.user_id
    where r.user_id=p_user and r.role='administrator' and p.active);
$$;

create or replace function public.deliver_schedule_notice(
  p_kind text, p_id uuid, p_owner uuid, p_message text, p_key text, p_admins boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notifications(recipient_account_id,target_type,target_id,message,delivery_key)
  select p.account_id,p_kind,p_id,p_message,p_key from profiles p
  where p.active and case when p_admins then
    p.account_id<>p_owner and exists(select 1 from staff_roles r where r.user_id=p.account_id and r.role='administrator')
    else p.account_id=p_owner end
  on conflict (recipient_account_id,delivery_key) where delivery_key is not null do nothing;
end;
$$;

-- Creation is announced only after the main calendar date exists.
create or replace function public.schedule_notice_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare e events; v_kind text; v_id uuid; v_owner uuid; v_creator uuid; v_title text;
begin
  if tg_table_name='event_occurrences' then
    select * into e from events where id=new.event_id;
    if not found or e.status<>'pending' or public.schedule_admin(e.creator_account_id) then return new; end if;
    perform public.deliver_schedule_notice('event',e.id,e.owner_account_id,
      'New schedule: '||e.title||' — awaiting approval.','event-created:'||e.id,true);
    return new;
  end if;
  v_kind:=case when tg_table_name='events' then 'event' else 'booking' end;
  v_id:=new.id; v_owner:=new.owner_account_id; v_creator:=new.creator_account_id;
  if public.schedule_admin(v_creator) then return new; end if;
  if v_kind='event' then v_title:=new.title; else v_title:='Conference Room booking'; end if;
  if tg_op='INSERT' then
    if new.status='pending' then
      perform public.deliver_schedule_notice(v_kind,v_id,v_owner,'New '||v_title||' — awaiting approval.',v_kind||'-created:'||v_id,true);
    end if;
  elsif new.status is distinct from old.status and coalesce(current_setting('csc.reviewing_change',true),'')<>'yes' then
    perform public.deliver_schedule_notice(v_kind,v_id,v_owner,
      v_title||' — '||replace(new.status::text,'_',' ')||'.',
      v_kind||'-decision:'||v_id||':'||txid_current()||':'||new.status::text,false);
  end if;
  return new;
end;
$$;
drop trigger if exists schedule_created_notice on public.event_occurrences;
create trigger schedule_created_notice after insert on public.event_occurrences for each row execute function public.schedule_notice_trigger();
drop trigger if exists schedule_decision_notice on public.events;
create trigger schedule_decision_notice after update of status on public.events for each row execute function public.schedule_notice_trigger();
drop trigger if exists booking_lifecycle_notice on public.room_bookings;
create trigger booking_lifecycle_notice after insert or update of status on public.room_bookings for each row execute function public.schedule_notice_trigger();

-- Writes to requests go through the locked, owner-checked RPCs below.
create or replace function public.schedule_revision_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('csc.reviewing_change',true),'')<>'yes' then
    raise exception 'Use the schedule request and review actions to change requests.';
  end if;
  return new;
end;
$$;
drop trigger if exists schedule_revision_guard on public.event_revisions;
create trigger schedule_revision_guard before insert or update on public.event_revisions for each row execute function public.schedule_revision_guard();
drop trigger if exists booking_revision_guard on public.booking_revisions;
create trigger booking_revision_guard before insert or update on public.booking_revisions for each row execute function public.schedule_revision_guard();

alter table public.booking_revisions enable row level security;
drop policy if exists "booking requests owner or admin read" on public.booking_revisions;
create policy "booking requests owner or admin read" on public.booking_revisions for select to authenticated
using (public.schedule_admin(auth.uid()) or exists(select 1 from public.room_bookings b where b.id=booking_id and b.owner_account_id=auth.uid()));
grant select on public.booking_revisions to authenticated;

create or replace function public.request_schedule_change(p_kind text,p_id uuid,p_request_type text,p_values jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e events; b room_bookings; result jsonb; v_owner uuid; v_title text;
begin
  if auth.uid() is null or not exists(select 1 from profiles where account_id=auth.uid() and active) then raise exception 'Sign in to an active account.'; end if;
  if p_request_type not in ('edit','cancellation') or p_request_type is null then raise exception 'Invalid request type.'; end if;
  perform set_config('csc.reviewing_change','yes',true);
  if p_kind='event' then
    select * into e from events where id=p_id for update;
    if not found or e.owner_account_id<>auth.uid() then raise exception 'Only the owner can request changes.'; end if;
    if e.status='cancelled' or public.schedule_admin(e.creator_account_id) then raise exception 'This schedule cannot request review.'; end if;
    if exists(select 1 from event_revisions where event_id=p_id and status='pending') then raise exception 'A change request is already waiting for review.'; end if;
    if p_request_type='edit' and (p_values->'event' is null or p_values->'series' is null or p_values->'occurrence' is null) then raise exception 'Schedule details are incomplete.'; end if;
    insert into event_revisions(event_id,base_version,request_type,previous_values,proposed_values,requester_id)
    values(p_id,e.version,p_request_type,to_jsonb(e),coalesce(p_values,'{}'),auth.uid()) returning to_jsonb(event_revisions.*) into result;
    v_owner:=e.owner_account_id; v_title:=e.title;
  elsif p_kind='booking' then
    select * into b from room_bookings where id=p_id for update;
    if not found or b.owner_account_id<>auth.uid() then raise exception 'Only the owner can request changes.'; end if;
    if b.status='cancelled' or public.schedule_admin(b.creator_account_id) then raise exception 'This booking cannot request review.'; end if;
    if exists(select 1 from booking_revisions where booking_id=p_id and status='pending') then raise exception 'A change request is already waiting for review.'; end if;
    insert into booking_revisions(booking_id,base_version,request_type,proposed_values,requester_id)
    values(p_id,b.version,p_request_type,coalesce(p_values,'{}'),auth.uid()) returning to_jsonb(booking_revisions.*) into result;
    v_owner:=b.owner_account_id; v_title:='Conference Room booking';
  else raise exception 'Invalid calendar type.';
  end if;
  perform public.deliver_schedule_notice(p_kind,p_id,v_owner,
    v_title||' — '||case when p_request_type='cancellation' then 'deletion' else 'edit' end||' requested.',
    'request:'||(result->>'id'),true);
  perform set_config('csc.reviewing_change','no',true);
  return result;
end;
$$;

create or replace function public.review_schedule_change(p_kind text,p_revision_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare er event_revisions; br booking_revisions; e events; b room_bookings;
  ep events; sp event_series; op event_occurrences; bp room_bookings;
  v_id uuid; v_owner uuid; v_title text; v_type text; result jsonb;
begin
  if not public.schedule_admin(auth.uid()) then raise exception 'An active administrator must review this request.'; end if;
  if p_approve is null then raise exception 'A decision is required.'; end if;
  perform set_config('csc.reviewing_change','yes',true);
  if p_kind='event' then
    select event_id into v_id from event_revisions where id=p_revision_id;
    select * into e from events where id=v_id for update;
    select * into er from event_revisions where id=p_revision_id for update;
    if er.id is null or e.id is null or er.status<>'pending' then raise exception 'This request is no longer pending.'; end if;
    if e.version<>er.base_version then raise exception 'The schedule changed. Refresh before reviewing.'; end if;
    if p_approve then
      if er.request_type='cancellation' then
        update events set status='cancelled',version=version+1,updated_at=now() where id=e.id;
      else
        ep:=jsonb_populate_record(e,er.proposed_values->'event');
        select * into sp from event_series where event_id=e.id order by id limit 1 for update;
        select * into op from event_occurrences where event_id=e.id order by starts_at limit 1 for update;
        if sp.id is null or op.id is null then raise exception 'The schedule date is missing.'; end if;
        sp:=jsonb_populate_record(sp,er.proposed_values->'series');
        op:=jsonb_populate_record(op,er.proposed_values->'occurrence');
        update events set title=ep.title,category=ep.category,other_category_detail=ep.other_category_detail,
          venue=ep.venue,visibility=ep.visibility,public_description=ep.public_description,purpose=ep.purpose,
          expected_attendees=ep.expected_attendees,status='approved',version=version+1,updated_at=now() where id=e.id;
        update event_series set frequency=sp.frequency,recurrence_rule=sp.recurrence_rule,
          local_start_template=sp.local_start_template,local_end_template=sp.local_end_template,repeat_until=sp.repeat_until where event_id=e.id;
        update event_occurrences set starts_at=op.starts_at,ends_at=op.ends_at,original_occurrence_key=op.original_occurrence_key,cancelled=false where event_id=e.id;
      end if;
    end if;
    update event_revisions set status=case when p_approve then 'approved'::revision_status else 'rejected'::revision_status end,
      reviewer_id=auth.uid(),decided_at=now() where id=er.id returning to_jsonb(event_revisions.*) into result;
    v_owner:=e.owner_account_id; v_title:=e.title; v_type:=er.request_type;
  elsif p_kind='booking' then
    select booking_id into v_id from booking_revisions where id=p_revision_id;
    select * into b from room_bookings where id=v_id for update;
    select * into br from booking_revisions where id=p_revision_id for update;
    if br.id is null or b.id is null or br.status<>'pending' then raise exception 'This request is no longer pending.'; end if;
    if b.version<>br.base_version then raise exception 'The booking changed. Refresh before reviewing.'; end if;
    if p_approve then
      if br.request_type='cancellation' then
        update room_bookings set status='cancelled',version=version+1,updated_at=now() where id=b.id;
      else
        bp:=jsonb_populate_record(b,br.proposed_values);
        update room_bookings set selected_date=bp.selected_date,starts_at=bp.starts_at,ends_at=bp.ends_at,
          frequency=bp.frequency,repeat_until_month=bp.repeat_until_month,repeat_until_year=bp.repeat_until_year,
          repeat_until_resolved=bp.repeat_until_resolved,status='approved',version=version+1,updated_at=now() where id=b.id;
      end if;
    end if;
    update booking_revisions set status=case when p_approve then 'approved'::revision_status else 'rejected'::revision_status end,
      reviewer_id=auth.uid(),decided_at=now() where id=br.id returning to_jsonb(booking_revisions.*) into result;
    v_owner:=b.owner_account_id; v_title:='Conference Room booking'; v_type:=br.request_type;
  else raise exception 'Invalid calendar type.';
  end if;
  perform public.deliver_schedule_notice(p_kind,v_id,v_owner,
    v_title||' — '||case when v_type='cancellation' then 'deletion' else 'edit' end||' request '||case when p_approve then 'approved.' else 'rejected.' end,
    'decision:'||p_revision_id,false);
  perform set_config('csc.reviewing_change','no',true);
  return result;
end;
$$;

-- Prevent old clients from bypassing approval or deleting an org schedule directly.
create or replace function public.schedule_owner_write_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.schedule_admin(auth.uid())
    and coalesce(current_setting('csc.reviewing_change',true),'')<>'yes' then
    raise exception 'Submit an edit or deletion request for admin review.';
  end if;
  if tg_op='DELETE' then return old; end if;
  if coalesce(current_setting('csc.reviewing_change',true),'')<>'yes' then
    if tg_table_name='events' then
      if exists(select 1 from event_revisions where event_id=old.id and status='pending') then raise exception 'Review the pending change request first.'; end if;
    else
      if exists(select 1 from booking_revisions where booking_id=old.id and status='pending') then raise exception 'Review the pending change request first.'; end if;
    end if;
  end if;
  new.version:=old.version+1;
  return new;
end;
$$;
drop trigger if exists schedule_owner_write_guard on public.events;
create trigger schedule_owner_write_guard before update or delete on public.events for each row execute function public.schedule_owner_write_guard();
drop trigger if exists booking_owner_write_guard on public.room_bookings;
create trigger booking_owner_write_guard before update or delete on public.room_bookings for each row execute function public.schedule_owner_write_guard();

revoke all on function public.deliver_schedule_notice(text,uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.request_schedule_change(text,uuid,text,jsonb) from public,anon;
revoke all on function public.review_schedule_change(text,uuid,boolean) from public,anon;
grant execute on function public.request_schedule_change(text,uuid,text,jsonb) to authenticated;
grant execute on function public.review_schedule_change(text,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;

-- Both rows must report ready = true after installation.
select 'request_schedule_change' as function_name,
  to_regprocedure('public.request_schedule_change(text,uuid,text,jsonb)') is not null as ready
union all
select 'review_schedule_change',
  to_regprocedure('public.review_schedule_change(text,uuid,boolean)') is not null;
