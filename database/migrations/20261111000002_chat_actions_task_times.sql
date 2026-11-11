-- As the owner asked:
--
-- * Chat works more like WhatsApp: message info (who it reached and who read it,
--   with times), star, forward, delete for me, and edit or delete for everyone within
--   five minutes of sending.
-- * Tasks can have a time as well as a date, so people can plan their own day from
--   the calendar.

-- ---------------------------------------------------------------------------
-- Task times
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column due_time time,
  add constraint tasks_time_needs_date check (due_time is null or due_date is not null);

-- The time follows the deadline's rules: whoever manages the task, or the assignee
-- while the work is open, may change it.
create function public.check_task_due_time()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null or new.due_time is not distinct from old.due_time then
    return new;
  end if;
  if (public.can_manage_task(old.id) and (old.assignee_id is distinct from v_actor or old.created_by = v_actor))
     or (old.assignee_id = v_actor and old.status not in ('completed', 'rejected')) then
    return new;
  end if;
  raise exception 'You do not have permission to change these task details.' using errcode = 'insufficient_privilege';
end;
$$;

create trigger tasks_due_time_check before update of due_time on public.tasks
  for each row execute function public.check_task_due_time();

-- ---------------------------------------------------------------------------
-- Read receipts per message, for message info
-- ---------------------------------------------------------------------------

alter table public.messages add column forwarded boolean not null default false;

create table public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, employee_id)
);
create index message_reads_employee_idx on public.message_reads (employee_id);
-- Read only through get_message_info, by the message's author.
alter table public.message_reads enable row level security;

-- As before, plus: records when each new message was first read.
create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_previous timestamptz;
begin
  if v_actor is null or not public.can_view_conversation(p_conversation) then
    return;
  end if;

  select last_read_at into v_previous
  from public.conversation_reads where conversation_id = p_conversation and employee_id = v_actor;

  insert into public.message_reads (message_id, employee_id)
  select m.id, v_actor
  from public.messages m
  where m.conversation_id = p_conversation
    and m.author_id is distinct from v_actor
    and m.deleted_at is null
    and m.created_at > coalesce(v_previous, '-infinity'::timestamptz)
  on conflict do nothing;

  insert into public.conversation_reads (conversation_id, employee_id, last_read_at)
  values (p_conversation, v_actor, now())
  on conflict (conversation_id, employee_id) do update set last_read_at = now();

  -- Reading the conversation also clears its message and mention notifications.
  update public.notifications
  set read_at = now()
  where recipient_id = v_actor
    and read_at is null
    and link = '/messages/' || p_conversation;
end;
$$;

-- Ticks: a message is delivered once everyone else's app has checked in since it was
-- sent, and read once everyone else has opened the conversation since.
drop function public.get_conversation_read_state(uuid);
create function public.get_conversation_read_state(p_conversation uuid)
returns table (others integer, everyone_read_at timestamptz, everyone_delivered_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if not public.can_view_conversation(p_conversation) then
    return;
  end if;

  return query
  select count(*)::integer,
    min(coalesce(r.last_read_at, '-infinity'::timestamptz)),
    min(greatest(coalesce(r.last_read_at, '-infinity'::timestamptz), coalesce(pr.last_seen_at, '-infinity'::timestamptz)))
  from public.get_conversation_participant_ids(p_conversation) as p (id)
  left join public.conversation_reads r on r.conversation_id = p_conversation and r.employee_id = p.id
  left join public.employee_presence pr on pr.employee_id = p.id
  where p.id <> v_actor;
end;
$$;

-- Who a message reached and who read it, for its author only, as in WhatsApp.
create function public.get_message_info(p_message uuid)
returns table (employee_id uuid, full_name text, read_at timestamptz, delivered boolean)
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
    mr.read_at is not null or coalesce(pr.last_seen_at >= v_message.created_at, false)
  from public.get_conversation_participant_ids(v_message.conversation_id) as p (id)
  join public.employees e on e.id = p.id
  left join public.message_reads mr on mr.message_id = p_message and mr.employee_id = p.id
  left join public.employee_presence pr on pr.employee_id = p.id
  where p.id <> v_actor
  order by mr.read_at nulls last, e.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starred messages and delete for me
-- ---------------------------------------------------------------------------

create table public.message_stars (
  message_id uuid not null references public.messages (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, employee_id)
);
create index message_stars_employee_idx on public.message_stars (employee_id, created_at desc);

-- Messages someone removed from their own view only.
create table public.message_hidden (
  message_id uuid not null references public.messages (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, employee_id)
);

create function public.can_view_message(p_message uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select public.can_view_conversation(m.conversation_id) from public.messages m where m.id = p_message),
    false
  )
$$;

alter table public.message_stars enable row level security;
alter table public.message_hidden enable row level security;

create policy message_stars_own on public.message_stars for all to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id() and public.can_view_message(message_id));
create policy message_hidden_own on public.message_hidden for all to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id() and public.can_view_message(message_id));

-- ---------------------------------------------------------------------------
-- Editing and deleting for everyone: within five minutes, as the owner asked
-- ---------------------------------------------------------------------------

create or replace function public.guard_message_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_author boolean;
  v_in_time boolean;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  v_is_author := old.author_id = v_actor;
  v_in_time := now() - old.created_at <= interval '5 minutes';

  if new.conversation_id is distinct from old.conversation_id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
     or new.edited_at is distinct from old.edited_at
     or new.deleted_by is distinct from old.deleted_by
     or new.pinned_by is distinct from old.pinned_by
     or new.forwarded is distinct from old.forwarded then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if old.deleted_at is not null then
    raise exception 'This message has been deleted.' using errcode = 'check_violation';
  end if;

  if new.deleted_at is not null then
    -- Announcements can be taken down by whoever may post them, at any time.
    if not (
      (v_is_author and v_in_time)
      or ((select kind from public.conversations where id = old.conversation_id) = 'announcement'
          and public.has_permission('messages.announce'))
    ) then
      raise exception '%', case when v_is_author
          then 'Messages can only be deleted for everyone within 5 minutes of sending. You can still delete it for yourself.'
          else 'You can only delete your own messages for everyone.' end
        using errcode = 'insufficient_privilege';
    end if;
    new.deleted_at := now();
    new.deleted_by := v_actor;
    new.body := '';
    new.file_id := null;
    new.contact_employee_id := null;
    new.meeting_id := null;
    new.poll_question := null;
    new.poll_options := null;
    new.poll_allows_multiple := false;
    new.pinned_at := null;
    new.pinned_by := null;
    return new;
  end if;

  if new.contact_employee_id is distinct from old.contact_employee_id
     or new.meeting_id is distinct from old.meeting_id
     or new.poll_question is distinct from old.poll_question
     or new.poll_options is distinct from old.poll_options
     or new.poll_allows_multiple is distinct from old.poll_allows_multiple then
    raise exception 'Cards and polls cannot be changed once sent.' using errcode = 'check_violation';
  end if;

  if new.body is distinct from old.body or new.file_id is distinct from old.file_id then
    if not v_is_author then
      raise exception 'You can only edit your own messages.' using errcode = 'insufficient_privilege';
    end if;
    if new.file_id is distinct from old.file_id then
      raise exception 'Attachments cannot be changed.' using errcode = 'check_violation';
    end if;
    if not v_in_time then
      raise exception 'Messages can only be edited within 5 minutes of sending.' using errcode = 'check_violation';
    end if;
    new.edited_at := now();
  end if;

  if new.pinned_at is distinct from old.pinned_at then
    if not public.can_post_in_conversation(old.conversation_id) then
      raise exception 'You cannot pin messages here.' using errcode = 'insufficient_privilege';
    end if;
    new.pinned_at := case when new.pinned_at is null then null else now() end;
    new.pinned_by := case when new.pinned_at is null then null else v_actor end;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, delete on public.message_stars to authenticated;
grant select, insert, delete on public.message_hidden to authenticated;
revoke all on public.message_reads from authenticated;

grant execute on function public.get_conversation_read_state(uuid) to authenticated;
grant execute on function public.get_message_info(uuid) to authenticated;
grant execute on function public.can_view_message(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
