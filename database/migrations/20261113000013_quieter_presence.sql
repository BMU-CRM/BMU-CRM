-- Fewer check-ins from open apps, to cut the requests the live site has to answer.
--
-- An app in the foreground still checks in every minute. One in the background (another
-- tab in front, the window minimised or the phone screen off) now checks in every 4
-- minutes instead of every minute. So a person counts as offline after 6 minutes without
-- a check-in, not 3, and messages are still counted as delivered as they arrive while the
-- app is open in the background.

-- As before, with 6 minutes instead of 3.
create or replace function public.presence_status(v_presence public.employee_presence)
returns text
language sql stable set search_path = ''
as $$
  select case
    when v_presence.employee_id is null
      or v_presence.last_seen_at is null
      or v_presence.last_seen_at < now() - interval '6 minutes'
      or v_presence.chosen_status = 'offline' then 'offline'
    when v_presence.chosen_status is not null then v_presence.chosen_status
    when v_presence.last_active_at > now() - interval '5 minutes' then 'available'
    else 'away'
  end
$$;

-- As before, with 6 minutes instead of 3.
create or replace function public.record_message_deliveries()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_since timestamptz;
  v_was_open boolean;
begin
  if new.last_seen_at is null or (tg_op = 'UPDATE' and new.last_seen_at is not distinct from old.last_seen_at) then
    return null;
  end if;
  v_since := case when tg_op = 'UPDATE' and old.last_seen_at is not null then old.last_seen_at else new.last_seen_at - interval '7 days' end;
  -- Checking in again within a few minutes means the app stayed open, so messages
  -- arrived live, as they were sent.
  v_was_open := tg_op = 'UPDATE' and old.last_seen_at is not null and new.last_seen_at - old.last_seen_at <= interval '6 minutes';

  insert into public.message_deliveries (message_id, employee_id, delivered_at)
  select m.id, new.employee_id, case when v_was_open then m.created_at else new.last_seen_at end
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.created_at > v_since
    and m.created_at <= new.last_seen_at
    and m.author_id is distinct from new.employee_id
    and m.deleted_at is null
    and public.is_conversation_participant(c, new.employee_id)
  on conflict (message_id, employee_id) do nothing;
  return null;
end;
$$;
