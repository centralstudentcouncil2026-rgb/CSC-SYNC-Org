begin;
alter table public.concerns alter column submitter_account_id drop not null;
alter table public.concerns
  add column if not exists public_kind text,
  add column if not exists reporter_name text,
  add column if not exists reporter_contact text,
  add column if not exists public_request_id uuid,
  add column if not exists public_client_id uuid;
create unique index if not exists concerns_public_request_idx
  on public.concerns(public_request_id) where public_request_id is not null;
create index if not exists concerns_public_client_idx
  on public.concerns(public_client_id, created_at) where public_client_id is not null;

-- Anonymous visitors submit through the function only; they cannot read concerns.
revoke all on public.concerns from anon;
drop policy if exists "concerns authenticated source" on public.concerns;
create policy "concerns authenticated source" on public.concerns
  as restrictive for insert to authenticated
  with check (submitter_account_id = auth.uid() and public_kind is null
    and reporter_name is null and reporter_contact is null
    and public_request_id is null and public_client_id is null);

create or replace function public.submit_public_feedback(
  p_request_id uuid, p_client_id uuid, p_kind text, p_title text,
  p_message text, p_name text default '', p_contact text default '',
  p_website text default ''
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_request_id is null or p_client_id is null
    or p_kind is null or p_kind not in ('Concern','Thought','Idea')
    or length(btrim(coalesce(p_title,''))) not between 1 and 160
    or length(btrim(coalesce(p_message,''))) not between 1 and 4000
    or length(coalesce(p_name,'')) > 100
    or length(coalesce(p_contact,'')) > 300 then
    raise exception 'Please check the type, title, message, and contact details.';
  end if;
  if btrim(coalesce(p_website,'')) <> '' then
    raise exception 'This submission could not be accepted.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text, 43));
  if exists(select 1 from concerns where public_request_id=p_request_id
    and public_client_id=p_client_id) then
    return jsonb_build_object('submitted',true);
  end if;
  if exists(select 1 from concerns where public_client_id=p_client_id
    and created_at > now()-interval '1 minute') then
    raise exception 'Please wait a minute before sending another submission.';
  end if;
  insert into concerns(submitter_account_id, category, title, description,
    status, public_kind, reporter_name, reporter_contact, public_request_id, public_client_id)
  values(null, 'Public ' || p_kind, btrim(p_title), btrim(p_message), 'open',
    p_kind, nullif(btrim(p_name),''), nullif(btrim(p_contact),''), p_request_id, p_client_id);
  return jsonb_build_object('submitted',true);
end;
$$;
revoke all on function public.submit_public_feedback(uuid,uuid,text,text,text,text,text,text) from public;
grant execute on function public.submit_public_feedback(uuid,uuid,text,text,text,text,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
