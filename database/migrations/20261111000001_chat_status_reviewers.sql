-- As the owner asked:
--
-- * Chat messages can carry a contact card, a poll or an event (a meeting scheduled
--   from the chat), alongside the text, files and links they already carry.
-- * Read ticks: everyone's read position decides when a message counts as seen.
-- * Availability, as in Teams: Available, Busy, Do not disturb, Be right back,
--   Appear away and Appear offline, chosen by each person, or worked out from activity.
-- * Reviewers of tasks are people who manage tasks (department heads, Client
--   Managers, the Founder and Co-Founder) or whoever assigned the task.

-- ---------------------------------------------------------------------------
-- Contact cards, polls and events in chat
-- ---------------------------------------------------------------------------

alter table public.messages
  add column contact_employee_id uuid references public.employees (id) on delete set null,
  add column meeting_id uuid references public.meetings (id) on delete set null,
  add column poll_question text check (poll_question is null or length(trim(poll_question)) between 1 and 300),
  add column poll_options text[],
  add column poll_allows_multiple boolean not null default false,
  add constraint messages_poll_shape check (
    (poll_question is null) = (poll_options is null)
    and (poll_options is null or array_length(poll_options, 1) between 2 and 12)
  );

alter table public.messages drop constraint messages_not_empty;
alter table public.messages add constraint messages_not_empty check (
  deleted_at is not null or length(trim(body)) > 0 or file_id is not null
  or contact_employee_id is not null or meeting_id is not null or poll_question is not null
);

create table public.message_poll_votes (
  message_id uuid not null references public.messages (id) on delete cascade,
  -- Kept here so open chats hear about new votes in their own conversation.
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  option_index integer not null check (option_index between 0 and 11),
  created_at timestamptz not null default now(),
  primary key (message_id, employee_id, option_index)
);
create index message_poll_votes_conversation_idx on public.message_poll_votes (conversation_id);

-- What a message is about, in a few words, for the conversation list and notifications.
create function public.message_preview(v_message public.messages)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when v_message.deleted_at is not null then 'Message deleted'
    when length(trim(v_message.body)) > 0 then v_message.body
    when v_message.poll_question is not null then 'Poll: ' || v_message.poll_question
    when v_message.meeting_id is not null then 'Event: ' || coalesce(
      (select m.title from public.meetings m where m.id = v_message.meeting_id), 'a meeting')
    when v_message.contact_employee_id is not null then 'Contact: ' || coalesce(
      (select e.full_name from public.employees e where e.id = v_message.contact_employee_id), 'a colleague')
    else 'Sent a file'
  end
$$;

create or replace function public.guard_message_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  new.author_id := public.current_employee_id();
  new.edited_at := null;
  new.deleted_at := null;
  new.deleted_by := null;
  new.pinned_at := null;
  new.pinned_by := null;
  new.created_at := now();

  if not public.can_post_in_conversation(new.conversation_id) then
    raise exception 'You cannot post in this conversation.' using errcode = 'insufficient_privilege';
  end if;
  if new.file_id is not null and not public.can_view_file(new.file_id) then
    raise exception 'You cannot send this file.' using errcode = 'insufficient_privilege';
  end if;
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages where id = new.reply_to_id and conversation_id = new.conversation_id
  ) then
    raise exception 'You can only reply within the same conversation.' using errcode = 'check_violation';
  end if;
  if new.contact_employee_id is not null
     and not exists (select 1 from public.employees where id = new.contact_employee_id and is_active) then
    raise exception 'Choose an active colleague to share.' using errcode = 'check_violation';
  end if;
  if new.meeting_id is not null and not public.can_view_meeting(new.meeting_id) then
    raise exception 'You cannot share this meeting.' using errcode = 'insufficient_privilege';
  end if;
  if new.poll_options is not null then
    new.poll_question := trim(new.poll_question);
    new.poll_options := array(select trim(o) from unnest(new.poll_options) as o);
    if exists (select 1 from unnest(new.poll_options) as o where length(o) = 0 or length(o) > 120) then
      raise exception 'Each poll option needs 1 to 120 characters.' using errcode = 'check_violation';
    end if;
    if (select count(distinct lower(o)) from unnest(new.poll_options) as o) <> array_length(new.poll_options, 1) then
      raise exception 'Poll options must be different from each other.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- As before, plus: cards and polls cannot be changed once sent, and deleting a
-- message clears them too.
create or replace function public.guard_message_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_author boolean;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  v_is_author := old.author_id = v_actor;

  if new.conversation_id is distinct from old.conversation_id
     or new.author_id is distinct from old.author_id
     or new.created_at is distinct from old.created_at
     or new.reply_to_id is distinct from old.reply_to_id
     or new.edited_at is distinct from old.edited_at
     or new.deleted_by is distinct from old.deleted_by
     or new.pinned_by is distinct from old.pinned_by then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if old.deleted_at is not null then
    raise exception 'This message has been deleted.' using errcode = 'check_violation';
  end if;

  if new.deleted_at is not null then
    if not (v_is_author or (
      (select kind from public.conversations where id = old.conversation_id) = 'announcement'
      and public.has_permission('messages.announce')
    )) then
      raise exception 'You can only delete your own messages.' using errcode = 'insufficient_privilege';
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

-- Replaces the person's votes in a poll with their new choice. An empty list takes
-- their vote back.
create function public.vote_in_poll(p_message uuid, p_options integer[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_message public.messages;
  v_choices integer[] := array(select distinct o from unnest(coalesce(p_options, '{}')) as o order by 1);
begin
  select * into v_message from public.messages where id = p_message;
  if v_actor is null or not found or v_message.poll_options is null or v_message.deleted_at is not null
     or not public.can_post_in_conversation(v_message.conversation_id) then
    raise exception 'You cannot vote in this poll.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from unnest(v_choices) as o where o < 0 or o >= array_length(v_message.poll_options, 1)) then
    raise exception 'Choose one of the poll options.' using errcode = 'check_violation';
  end if;
  if not v_message.poll_allows_multiple and coalesce(array_length(v_choices, 1), 0) > 1 then
    raise exception 'This poll takes one answer.' using errcode = 'check_violation';
  end if;

  delete from public.message_poll_votes where message_id = p_message and employee_id = v_actor;
  insert into public.message_poll_votes (message_id, conversation_id, employee_id, option_index)
  select p_message, v_message.conversation_id, v_actor, o from unnest(v_choices) as o;
end;
$$;

-- Schedules a meeting from a chat and posts it there as an event. Everyone who takes
-- part in the conversation is invited.
create function public.post_conversation_event(
  p_conversation uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_meeting_link text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_meeting uuid;
begin
  if v_actor is null or not public.has_permission('meetings.create')
     or not public.can_post_in_conversation(p_conversation) then
    raise exception 'You cannot schedule an event here.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.meetings (title, kind, starts_at, ends_at, meeting_link, organizer_id)
  values (trim(p_title), 'internal', p_starts_at, p_ends_at, nullif(trim(coalesce(p_meeting_link, '')), ''), v_actor)
  returning id into v_meeting;

  insert into public.meeting_participants (meeting_id, employee_id)
  select v_meeting, p.id
  from public.get_conversation_participant_ids(p_conversation) as p (id)
  where p.id <> v_actor
  limit 200;

  insert into public.messages (conversation_id, meeting_id) values (p_conversation, v_meeting);
  return v_meeting;
end;
$$;

-- When everyone else in the conversation had read up to, for read ticks. A message
-- sent before that moment has been seen by everyone.
create function public.get_conversation_read_state(p_conversation uuid)
returns table (others integer, everyone_read_at timestamptz)
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
    min(coalesce(r.last_read_at, '-infinity'::timestamptz))
  from public.get_conversation_participant_ids(p_conversation) as p (id)
  left join public.conversation_reads r on r.conversation_id = p_conversation and r.employee_id = p.id
  where p.id <> v_actor;
end;
$$;

-- The conversation list now also says who the other person in a direct chat is, for
-- their availability, and describes polls, events and contacts.
drop function public.get_my_conversations();
create function public.get_my_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  title text,
  department_name text,
  project_name text,
  client_name text,
  other_person_id uuid,
  other_person_name text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_author text,
  unread_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or not public.has_permission('messages.use') then
    return;
  end if;

  return query
  select
    c.id, c.kind, c.title, d.name, p.name, cl.company_name,
    other.id, other.full_name,
    c.last_message_at,
    last_message.body,
    last_message.author_name,
    (
      select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.deleted_at is null
        and m.author_id is distinct from v_actor
        and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    )
  from public.conversations c
  left join public.departments d on d.id = c.department_id
  left join public.projects p on p.id = c.project_id
  left join public.clients cl on cl.id = c.client_id
  left join public.conversation_reads r on r.conversation_id = c.id and r.employee_id = v_actor
  left join lateral (
    select e.id, e.full_name from public.conversation_members m
    join public.employees e on e.id = m.employee_id
    where c.kind = 'direct' and m.conversation_id = c.id and m.employee_id <> v_actor
    limit 1
  ) other on true
  left join lateral (
    select public.message_preview(m) as body, e.full_name as author_name
    from public.messages m
    left join public.employees e on e.id = m.author_id
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_message on true
  where public.is_conversation_participant(c, v_actor)
  order by c.last_message_at desc;
end;
$$;

create or replace function public.notify_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_author text;
  v_preview text := public.message_preview(new);
  v_link text := '/messages/' || new.conversation_id;
  v_recipient uuid;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  select full_name into v_author from public.employees where id = new.author_id;

  for v_recipient in select employee_id from public.message_mentions where message_id = new.id loop
    perform public.notify(v_recipient, 'mention', coalesce(v_author, 'Someone') || ' mentioned you', v_preview, v_link, 'high');
  end loop;

  if v_conversation.kind in ('direct', 'group') then
    for v_recipient in
      select p.id from public.get_conversation_participant_ids(new.conversation_id) as p (id)
      where not exists (select 1 from public.message_mentions mm where mm.message_id = new.id and mm.employee_id = p.id)
    loop
      perform public.notify(v_recipient, 'message_received',
        case when v_conversation.kind = 'direct' then 'New message from ' || coalesce(v_author, 'a colleague')
             else 'New message in ' || coalesce(v_conversation.title, 'a group') end,
        v_preview, v_link, 'normal', 'conversation:' || new.conversation_id);
    end loop;
  elsif v_conversation.kind = 'announcement' then
    for v_recipient in select p.id from public.get_conversation_participant_ids(new.conversation_id) as p (id) loop
      perform public.notify(v_recipient, 'announcement', 'New announcement from ' || coalesce(v_author, 'management'),
        v_preview, v_link, 'high');
    end loop;
  end if;

  return null;
end;
$$;

alter table public.message_poll_votes enable row level security;
create policy message_poll_votes_select on public.message_poll_votes for select to authenticated
  using (public.can_view_conversation(conversation_id));

alter publication live_updates add table public.message_poll_votes;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------

create table public.employee_presence (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  -- What the person chose. Empty means it is worked out from their activity.
  chosen_status text check (chosen_status in ('available', 'busy', 'do_not_disturb', 'be_right_back', 'away', 'offline')),
  -- The app checks in about once a minute while it is open.
  last_seen_at timestamptz,
  -- The last check-in while the person was actually using it.
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Teams-style rules: someone with the app closed is offline whatever they chose;
-- "Appear offline" always shows offline; otherwise their choice shows; with no choice,
-- they are available while active and away after five idle minutes.
create function public.presence_status(v_presence public.employee_presence)
returns text
language sql stable set search_path = ''
as $$
  select case
    when v_presence.employee_id is null
      or v_presence.last_seen_at is null
      or v_presence.last_seen_at < now() - interval '3 minutes'
      or v_presence.chosen_status = 'offline' then 'offline'
    when v_presence.chosen_status is not null then v_presence.chosen_status
    when v_presence.last_active_at > now() - interval '5 minutes' then 'available'
    else 'away'
  end
$$;

create function public.record_presence(p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null then
    return;
  end if;
  insert into public.employee_presence (employee_id, last_seen_at, last_active_at)
  values (v_actor, now(), case when p_active then now() end)
  on conflict (employee_id) do update
    set last_seen_at = now(),
        last_active_at = case when p_active then now() else public.employee_presence.last_active_at end;
end;
$$;

-- Empty resets to the status worked out from activity.
create function public.set_my_status(p_status text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_row public.employee_presence;
begin
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if p_status is not null and p_status not in ('available', 'busy', 'do_not_disturb', 'be_right_back', 'away', 'offline') then
    raise exception 'Choose a valid status.' using errcode = 'check_violation';
  end if;

  insert into public.employee_presence (employee_id, chosen_status, last_seen_at, last_active_at, updated_at)
  values (v_actor, p_status, now(), now(), now())
  on conflict (employee_id) do update
    set chosen_status = p_status, last_seen_at = now(), last_active_at = now(), updated_at = now()
  returning * into v_row;

  return public.presence_status(v_row);
end;
$$;

-- Everyone's availability is visible to every colleague, as names are.
create function public.get_presence(p_employees uuid[])
returns table (employee_id uuid, status text, chosen_status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.current_employee_id() is null then
    return;
  end if;

  return query
  select e.id, public.presence_status(p), p.chosen_status
  from public.employees e
  left join public.employee_presence p on p.employee_id = e.id
  where e.id = any (p_employees[1:500]) and e.is_active;
end;
$$;

alter table public.employee_presence enable row level security;

-- ---------------------------------------------------------------------------
-- Task reviewers
-- ---------------------------------------------------------------------------

create function public.employee_has_permission(p_employee uuid, p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.role_permissions rp on rp.role_id = e.role_id
    where e.id = p_employee and e.is_active and rp.permission_key = p_key
  )
$$;

-- People who may sign off work: anyone whose role manages tasks.
create function public.get_reviewer_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.is_active and public.current_employee_id() is not null
    and public.employee_has_permission(e.id, 'tasks.manage')
$$;

-- Runs after tasks_guard_insert (alphabetical), so the creator is already set.
create function public.check_task_reviewer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Recurring copies and other system work keep what the original had.
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then
    return new;
  end if;
  if new.reviewer_id is null or new.reviewer_id = new.created_by then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.reviewer_id is not distinct from old.reviewer_id then
    return new;
  end if;
  if not public.employee_has_permission(new.reviewer_id, 'tasks.manage') then
    raise exception 'Choose a reviewer who manages work: a department head, Client Manager, the Founder or Co-Founder, or whoever assigned the task.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger tasks_reviewer_check before insert or update of reviewer_id on public.tasks
  for each row execute function public.check_task_reviewer();

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select on public.message_poll_votes to authenticated;
revoke all on public.employee_presence from authenticated;

grant execute on function public.message_preview(public.messages) to authenticated;
grant execute on function public.vote_in_poll(uuid, integer[]) to authenticated;
grant execute on function public.post_conversation_event(uuid, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.get_conversation_read_state(uuid) to authenticated;
grant execute on function public.get_my_conversations() to authenticated;
grant execute on function public.record_presence(boolean) to authenticated;
grant execute on function public.set_my_status(text) to authenticated;
grant execute on function public.get_presence(uuid[]) to authenticated;
grant execute on function public.presence_status(public.employee_presence) to authenticated;
grant execute on function public.employee_has_permission(uuid, text) to authenticated;
grant execute on function public.get_reviewer_ids() to authenticated;
