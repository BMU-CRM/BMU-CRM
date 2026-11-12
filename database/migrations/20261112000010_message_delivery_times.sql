-- When each message reached each person, so message info can show "Delivered" with a
-- time, as WhatsApp does, next to "Read".
--
-- A message is delivered when the person's app has it. The app checks in about once a
-- minute while open (record_presence), so each check-in delivers everything that arrived
-- since the last one: at the moment it was sent if the app was open throughout, or at the
-- check-in if the app had been closed. Messages from before this migration keep showing
-- "delivered" without a time.

create table public.message_deliveries (
  message_id uuid not null references public.messages (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  delivered_at timestamptz not null,
  primary key (message_id, employee_id)
);
create index message_deliveries_employee_idx on public.message_deliveries (employee_id);
create index messages_created_idx on public.messages (created_at);

-- Read only through get_message_info, by the message's author.
alter table public.message_deliveries enable row level security;

create function public.record_message_deliveries()
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
  v_was_open := tg_op = 'UPDATE' and old.last_seen_at is not null and new.last_seen_at - old.last_seen_at <= interval '3 minutes';

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

create trigger employee_presence_record_deliveries after insert or update of last_seen_at on public.employee_presence
  for each row execute function public.record_message_deliveries();

-- As before, plus when it was delivered. Reading a message also delivers it.
drop function public.get_message_info(uuid);

create function public.get_message_info(p_message uuid)
returns table (employee_id uuid, full_name text, read_at timestamptz, delivered boolean, delivered_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_message public.messages;
begin
  select * into v_message from public.messages where id = p_message;
  if v_actor is null or not found or v_message.author_id is distinct from v_actor then
    return;
  end if;

  return query
  select e.id, e.full_name, mr.read_at,
    mr.read_at is not null or md.delivered_at is not null or coalesce(pr.last_seen_at >= v_message.created_at, false),
    case when md.delivered_at is null then mr.read_at when mr.read_at is null then md.delivered_at else least(md.delivered_at, mr.read_at) end
  from public.get_conversation_participant_ids(v_message.conversation_id) as p (id)
  join public.employees e on e.id = p.id
  left join public.message_reads mr on mr.message_id = p_message and mr.employee_id = p.id
  left join public.message_deliveries md on md.message_id = p_message and md.employee_id = p.id
  left join public.employee_presence pr on pr.employee_id = p.id
  where p.id <> v_actor
  order by mr.read_at nulls last, e.full_name;
end;
$$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant execute on function public.get_message_info(uuid) to authenticated;
