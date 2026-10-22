begin;
create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(account_id),
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason text not null check (length(btrim(reason)) between 1 and 200),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create or replace function public.calendar_blocks_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p join staff_roles r on r.user_id=p.account_id
 where p.account_id=auth.uid() and p.active and r.role::text='administrator');
$$;
revoke all on function public.calendar_blocks_admin() from public,anon;
grant execute on function public.calendar_blocks_admin() to authenticated;
alter table public.calendar_blocks enable row level security;
revoke all on public.calendar_blocks from public,anon,authenticated;
grant select,insert,delete on public.calendar_blocks to authenticated;
drop policy if exists "calendar blocks read" on public.calendar_blocks;
create policy "calendar blocks read" on public.calendar_blocks for select to authenticated
 using(exists(select 1 from profiles where account_id=auth.uid() and active));
drop policy if exists "calendar blocks create" on public.calendar_blocks;
create policy "calendar blocks create" on public.calendar_blocks for insert to authenticated
 with check(public.calendar_blocks_admin() and created_by=auth.uid());
drop policy if exists "calendar blocks remove" on public.calendar_blocks;
create policy "calendar blocks remove" on public.calendar_blocks for delete to authenticated
 using(public.calendar_blocks_admin() and created_by=auth.uid());
create or replace function public.lock_calendar_block()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(20261022,42);
 if tg_op='UPDATE' then raise exception 'Remove the block and create a new one to change its time.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
drop trigger if exists lock_calendar_block on public.calendar_blocks;
create trigger lock_calendar_block before insert or update or delete on public.calendar_blocks
for each row execute function public.lock_calendar_block();

create or replace function public.assert_calendar_available(p_creator uuid,p_start timestamptz,p_end timestamptz,p_frequency text,p_until date)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b calendar_blocks; anchor date; first_date date:=(p_start at time zone 'Asia/Manila')::date;
 last_date date:=(p_end at time zone 'Asia/Manila')::date;
 start_clock time:=(p_start at time zone 'Asia/Manila')::time;
 end_clock time:=(p_end at time zone 'Asia/Manila')::time;
 candidate_start timestamptz; candidate_end timestamptz;
begin
 perform pg_advisory_xact_lock(20261022,42);
 if p_start is null or p_end is null or p_end<=p_start then raise exception 'Choose a valid start and end time.'; end if;
 if p_frequency is null or p_frequency not in ('none','daily','weekly','monthly','yearly') then raise exception 'Invalid repeat frequency.'; end if;
 if p_frequency<>'none' and (p_until is null or p_until<first_date) then raise exception 'Choose a repeat end date on or after the start date.'; end if;
 for b in select * from calendar_blocks where created_by<>p_creator loop
  for anchor in select d::date from generate_series(
   greatest(first_date,(b.starts_at at time zone 'Asia/Manila')::date-(last_date-first_date))::timestamp,
   least(case when p_frequency='none' then first_date else coalesce(p_until,first_date) end,
     (b.ends_at at time zone 'Asia/Manila')::date)::timestamp,interval '1 day') d loop
   if anchor=first_date or p_frequency='daily'
    or (p_frequency='weekly' and (anchor-first_date)%7=0)
    or (p_frequency='monthly' and extract(day from anchor)=extract(day from first_date))
    or (p_frequency='yearly' and to_char(anchor,'MM-DD')=to_char(first_date,'MM-DD')) then
    candidate_start:=(anchor+start_clock) at time zone 'Asia/Manila';
    candidate_end:=((anchor+(last_date-first_date))+end_clock) at time zone 'Asia/Manila';
    if candidate_start<b.ends_at and candidate_end>b.starts_at then
     raise exception 'This date/time is blocked: % (% to %, Manila time).',b.reason,
       to_char(b.starts_at at time zone 'Asia/Manila','YYYY-MM-DD HH24:MI'),
       to_char(b.ends_at at time zone 'Asia/Manila','YYYY-MM-DD HH24:MI');
    end if;
   end if;
  end loop;
 end loop;
end; $$;
revoke all on function public.assert_calendar_available(uuid,timestamptz,timestamptz,text,date) from public,anon,authenticated;

create or replace function public.guard_calendar_time()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare creator uuid; series event_series; values_json jsonb;
begin
 select creator_account_id into creator from events where id=new.event_id;
 if tg_table_name='event_series' then
  if tg_op='UPDATE' and (new.local_start_template,new.local_end_template,new.frequency,new.repeat_until)
    is not distinct from (old.local_start_template,old.local_end_template,old.frequency,old.repeat_until) then return new; end if;
  perform assert_calendar_available(creator,new.local_start_template at time zone 'Asia/Manila',
   new.local_end_template at time zone 'Asia/Manila',new.frequency,new.repeat_until);
 elsif tg_table_name='event_occurrences' then
  if new.cancelled then return new; end if;
  if tg_op='UPDATE' and (new.starts_at,new.ends_at,new.cancelled) is not distinct from (old.starts_at,old.ends_at,old.cancelled) then return new; end if;
  select * into series from event_series where event_id=new.event_id order by id limit 1;
  perform assert_calendar_available(creator,new.starts_at,new.ends_at,coalesce(series.frequency,'none'),series.repeat_until);
 else
  if new.request_type<>'edit' or new.status<>'pending' then return new; end if;
  values_json:=new.proposed_values;
  select * into series from event_series where event_id=new.event_id order by id limit 1;
  if (series.local_start_template,series.local_end_template,series.frequency,series.repeat_until) is not distinct from
   ((values_json->'series'->>'local_start_template')::timestamp,(values_json->'series'->>'local_end_template')::timestamp,
    values_json->'series'->>'frequency',(values_json->'series'->>'repeat_until')::date) then return new; end if;
  perform assert_calendar_available(creator,(values_json->'occurrence'->>'starts_at')::timestamptz,
   (values_json->'occurrence'->>'ends_at')::timestamptz,values_json->'series'->>'frequency',(values_json->'series'->>'repeat_until')::date);
 end if;
 return new;
end; $$;
drop trigger if exists calendar_time_guard on public.event_series;
create trigger calendar_time_guard before insert or update on public.event_series for each row execute function guard_calendar_time();
drop trigger if exists calendar_time_guard on public.event_occurrences;
create trigger calendar_time_guard before insert or update on public.event_occurrences for each row execute function guard_calendar_time();
drop trigger if exists calendar_time_guard on public.event_revisions;
create trigger calendar_time_guard before insert or update on public.event_revisions for each row execute function guard_calendar_time();

create or replace function public.keep_calendar_creator()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.creator_account_id is distinct from old.creator_account_id then raise exception 'The schedule creator cannot be changed.'; end if;
 return new;
end; $$;
drop trigger if exists keep_calendar_creator on public.events;
create trigger keep_calendar_creator before update on public.events for each row execute function keep_calendar_creator();
revoke all on function public.keep_calendar_creator() from public,anon,authenticated;

create or replace function public.save_calendar_schedule(p_values jsonb,p_id uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e events; s event_series; o event_occurrences; v events; sv event_series; ov event_occurrences; is_admin boolean;
begin
 perform pg_advisory_xact_lock(20261022,42);
 if auth.uid() is null or not exists(select 1 from profiles where account_id=auth.uid() and active) then raise exception 'Sign in to an active account.'; end if;
 is_admin:=calendar_blocks_admin();
 v:=jsonb_populate_record(null::events,p_values->'event');
 sv:=jsonb_populate_record(null::event_series,p_values->'series');
 ov:=jsonb_populate_record(null::event_occurrences,p_values->'occurrence');
 if sv.local_start_template at time zone 'Asia/Manila' is distinct from ov.starts_at or sv.local_end_template at time zone 'Asia/Manila' is distinct from ov.ends_at then raise exception 'Schedule dates are inconsistent.'; end if;
 if p_id is null then
  perform assert_calendar_available(auth.uid(),ov.starts_at,ov.ends_at,sv.frequency,sv.repeat_until);
  insert into events(owner_account_id,creator_account_id,title,category,other_category_detail,venue,visibility,public_description,purpose,
   expected_attendees,contact_person_snapshot,contact_number_snapshot,status)
  values(auth.uid(),auth.uid(),v.title,v.category,v.other_category_detail,v.venue,v.visibility,v.public_description,v.purpose,
   v.expected_attendees,coalesce(v.contact_person_snapshot,''),coalesce(v.contact_number_snapshot,''),
   case when is_admin then 'approved'::event_status else 'pending'::event_status end) returning * into e;
  insert into event_series(event_id,timezone,frequency,recurrence_rule,local_start_template,local_end_template,repeat_until)
  values(e.id,'Asia/Manila',sv.frequency,'{}',sv.local_start_template,sv.local_end_template,sv.repeat_until) returning * into s;
  insert into event_occurrences(event_id,series_id,original_occurrence_key,starts_at,ends_at)
  values(e.id,s.id,ov.starts_at::text,ov.starts_at,ov.ends_at) returning * into o;
 else
  if not is_admin then raise exception 'Organizations must request schedule edits for review.'; end if;
  select * into e from events where id=p_id for update;
  if not found or p_version is null or e.version<>p_version then raise exception 'The schedule changed. Refresh before editing.'; end if;
  if exists(select 1 from event_revisions where event_id=p_id and status='pending') then raise exception 'Review the pending change request first.'; end if;
  if e.status<>'approved' and not exists(select 1 from staff_roles where user_id=e.creator_account_id and role::text='administrator') then raise exception 'Only approved organization schedules can be edited directly.'; end if;
  update events set title=v.title,category=v.category,other_category_detail=v.other_category_detail,venue=v.venue,visibility=v.visibility,
   public_description=v.public_description,purpose=v.purpose,expected_attendees=v.expected_attendees,version=version+1,updated_at=now(),
   status=case when exists(select 1 from staff_roles where user_id=e.creator_account_id and role::text='administrator') then 'approved'::event_status else e.status end
  where id=p_id returning * into e;
  with changed as (update event_series set frequency=sv.frequency,local_start_template=sv.local_start_template,local_end_template=sv.local_end_template,repeat_until=sv.repeat_until
  where event_id=p_id returning *) select * into s from changed order by id limit 1;
  if not found then raise exception 'Schedule recurrence is missing.'; end if;
  with changed as (update event_occurrences set original_occurrence_key=ov.starts_at::text,starts_at=ov.starts_at,ends_at=ov.ends_at,cancelled=false
  where event_id=p_id returning *) select * into o from changed order by id limit 1;
  if not found then raise exception 'Schedule date is missing.'; end if;
 end if;
 return jsonb_build_object('event',to_jsonb(e),'series',to_jsonb(s),'occurrence',to_jsonb(o));
end; $$;
revoke all on function public.save_calendar_schedule(jsonb,uuid,integer) from public,anon;
grant execute on function public.save_calendar_schedule(jsonb,uuid,integer) to authenticated;
revoke all on function public.lock_calendar_block(),public.guard_calendar_time() from public,anon,authenticated;
-- Schedule data is written through the atomic RPC; status decisions retain their existing endpoint.
revoke insert,update on public.events from public,anon,authenticated;
grant update(status,version,updated_at) on public.events to authenticated;
notify pgrst,'reload schema';
commit;
