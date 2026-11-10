-- The central notification engine. Notifications are created by the database when
-- something happens, so no part of the app can forget to send one. Push delivery is
-- handed to the app through the outgoing request queue, and deadline checks run every
-- 15 minutes.

create type public.notification_kind as enum (
  'task_assigned', 'task_due_soon', 'task_overdue', 'task_review_requested',
  'task_changes_requested', 'task_completed', 'task_rejected', 'task_escalated',
  'task_comment', 'file_received', 'message_received', 'mention', 'announcement'
);
create type public.notification_priority as enum ('normal', 'high');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.employees (id) on delete cascade,
  kind public.notification_kind not null,
  priority public.notification_priority not null default 'normal',
  title text not null,
  body text,
  link text check (link ~ '^/'),
  actor_id uuid,
  actor_name text,
  -- Repeated events with the same group key update one unread notification.
  group_key text,
  -- A dedupe key makes sure a reminder is only ever sent once.
  dedupe_key text,
  event_count integer not null default 1,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create unique index notifications_group_unique on public.notifications (recipient_id, group_key)
  where read_at is null and group_key is not null;
create unique index notifications_dedupe_unique on public.notifications (recipient_id, dedupe_key)
  where dedupe_key is not null;

-- In-app notifications are always on. Push can be turned off per kind.
create table public.notification_preferences (
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind public.notification_kind not null,
  push_enabled boolean not null default true,
  primary key (employee_id, kind)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_employee_idx on public.push_subscriptions (employee_id);

-- ---------------------------------------------------------------------------
-- Creating notifications
-- ---------------------------------------------------------------------------

-- Nobody is notified about their own actions, and inactive accounts get nothing.
create function public.notify(
  p_recipient uuid,
  p_kind public.notification_kind,
  p_title text,
  p_body text,
  p_link text,
  p_priority public.notification_priority default 'normal',
  p_group_key text default null,
  p_dedupe_key text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
begin
  if p_recipient is null or p_recipient = v_actor
     or not exists (select 1 from public.employees where id = p_recipient and is_active) then
    return;
  end if;

  if v_actor is not null then
    select full_name into v_actor_name from public.employees where id = v_actor;
  end if;

  if p_group_key is not null then
    insert into public.notifications
      (recipient_id, kind, priority, title, body, link, actor_id, actor_name, group_key)
    values (p_recipient, p_kind, p_priority, p_title, left(p_body, 300), p_link, v_actor, v_actor_name, p_group_key)
    on conflict (recipient_id, group_key) where read_at is null and group_key is not null
    do update set
      event_count = public.notifications.event_count + 1,
      title = excluded.title,
      body = excluded.body,
      actor_id = excluded.actor_id,
      actor_name = excluded.actor_name,
      created_at = now();
  elsif p_dedupe_key is not null then
    insert into public.notifications
      (recipient_id, kind, priority, title, body, link, actor_id, actor_name, dedupe_key)
    values (p_recipient, p_kind, p_priority, p_title, left(p_body, 300), p_link, v_actor, v_actor_name, p_dedupe_key)
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
  else
    insert into public.notifications
      (recipient_id, kind, priority, title, body, link, actor_id, actor_name)
    values (p_recipient, p_kind, p_priority, p_title, left(p_body, 300), p_link, v_actor, v_actor_name);
  end if;
end;
$$;

create function public.notify_task_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_link text := '/tasks/' || new.id;
  v_priority public.notification_priority :=
    case when new.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority;
begin
  if tg_op = 'INSERT' then
    if new.assignee_id is distinct from new.created_by then
      perform public.notify(new.assignee_id, 'task_assigned', 'New task assigned to you', new.title, v_link, v_priority);
    end if;
    return null;
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    perform public.notify(new.assignee_id, 'task_assigned', 'A task was assigned to you', new.title, v_link, v_priority);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'under_review' then
      perform public.notify(coalesce(new.reviewer_id, new.created_by), 'task_review_requested',
        'A task is ready for your review', new.title, v_link, v_priority);
    elsif new.status = 'changes_requested' then
      perform public.notify(new.assignee_id, 'task_changes_requested', 'Changes were requested on your task', new.title, v_link, 'high');
    elsif new.status = 'completed' then
      perform public.notify(new.assignee_id, 'task_completed', 'Your task was approved', new.title, v_link);
      if new.created_by is distinct from new.assignee_id then
        perform public.notify(new.created_by, 'task_completed', 'A task you assigned is complete', new.title, v_link);
      end if;
    elsif new.status = 'rejected' then
      perform public.notify(new.created_by, 'task_rejected', 'A task you assigned was rejected', new.title, v_link, 'high');
    end if;
  end if;

  if new.escalated_to is distinct from old.escalated_to then
    perform public.notify(new.escalated_to, 'task_escalated', 'A task was escalated to you',
      new.title || coalesce(': ' || new.escalation_reason, ''), v_link, 'high');
  end if;

  return null;
end;
$$;

create trigger tasks_notify after insert or update on public.tasks
  for each row execute function public.notify_task_events();

create function public.notify_task_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
  v_recipient uuid;
begin
  select * into v_task from public.tasks where id = new.task_id;

  for v_recipient in
    select distinct person from (
      select v_task.assignee_id as person
      union select v_task.created_by
      union select v_task.reviewer_id
      union select employee_id from public.task_collaborators where task_id = new.task_id
    ) people
    where person is not null
  loop
    perform public.notify(v_recipient, 'task_comment', 'New comment on a task',
      v_task.title || ': ' || new.body, '/tasks/' || new.task_id, 'normal', 'task-comment:' || new.task_id);
  end loop;

  return null;
end;
$$;

create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.notify_task_comment();

create function public.notify_file_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_file_name text;
  v_recipient uuid;
  v_title text := 'File received from ' || coalesce(new.sender_name, 'a colleague');
begin
  select name into v_file_name from public.files where id = new.file_id;

  for v_recipient in
    select new.recipient_employee_id where new.recipient_employee_id is not null
    union
    select e.id from public.employees e
    where new.recipient_department_id is not null and e.department_id = new.recipient_department_id and e.is_active
  loop
    perform public.notify(v_recipient, 'file_received', v_title,
      v_file_name || coalesce(': ' || new.note, ''), '/files/' || new.file_id);
  end loop;

  return null;
end;
$$;

create trigger file_shares_notify after insert on public.file_shares
  for each row execute function public.notify_file_share();

-- Direct and group messages notify everyone. Shared channels notify only people who
-- are @mentioned, so busy channels do not flood everyone's notifications.
create function public.notify_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_author text;
  v_preview text := case when length(trim(new.body)) > 0 then new.body else 'Sent a file' end;
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

-- Named to run after messages_after_insert, which records the mentions first.
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_message();

-- ---------------------------------------------------------------------------
-- Deadline reminders and automatic escalation, run every 15 minutes
-- ---------------------------------------------------------------------------

create function public.process_task_deadlines()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_task record;
  v_escalate_after_days constant integer := 2;
begin
  for v_task in
    select id, title, assignee_id, due_date from public.tasks
    where status not in ('completed', 'rejected') and assignee_id is not null
      and due_date between v_today and v_today + 1
  loop
    perform public.notify(v_task.assignee_id, 'task_due_soon',
      case when v_task.due_date = v_today then 'A task is due today' else 'A task is due tomorrow' end,
      v_task.title, '/tasks/' || v_task.id, 'normal', null, 'due-soon:' || v_task.id || ':' || v_task.due_date);
  end loop;

  for v_task in
    select id, title, assignee_id, created_by, due_date from public.tasks
    where status not in ('completed', 'rejected') and due_date < v_today
  loop
    perform public.notify(v_task.assignee_id, 'task_overdue', 'Your task is overdue',
      v_task.title, '/tasks/' || v_task.id, 'high', null, 'overdue:' || v_task.id || ':' || v_task.due_date);
    if v_task.created_by is distinct from v_task.assignee_id then
      perform public.notify(v_task.created_by, 'task_overdue', 'A task you assigned is overdue',
        v_task.title, '/tasks/' || v_task.id, 'high', null, 'overdue:' || v_task.id || ':' || v_task.due_date);
    end if;
  end loop;

  -- Work left overdue goes up to the assignee's manager, once.
  update public.tasks t
  set escalated_to = e.reporting_manager_id,
      escalated_at = now(),
      escalation_reason = 'Automatically escalated after ' || v_escalate_after_days || ' days overdue.'
  from public.employees e
  where e.id = t.assignee_id
    and e.reporting_manager_id is not null
    and t.escalated_to is null
    and t.status not in ('completed', 'rejected')
    and t.due_date <= v_today - v_escalate_after_days;
end;
$$;

select cron.schedule('process-task-deadlines', '*/15 * * * *', $$select public.process_task_deadlines()$$);

-- ---------------------------------------------------------------------------
-- Push delivery. The app's address and a shared secret are stored in a private
-- schema that the API cannot reach. Until they are set, nothing is sent.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_settings (
  key text primary key,
  value text not null
);

create function public.configure_notification_dispatch(p_url text, p_secret text)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.app_settings (key, value)
  values ('notification_dispatch_url', p_url), ('notification_dispatch_secret', p_secret)
  on conflict (key) do update set value = excluded.value
$$;

create function private.dispatch_notification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- A grouped notification is pushed again at most every two minutes.
  if tg_op = 'UPDATE' and (
    new.event_count = old.event_count
    or (old.pushed_at is not null and old.pushed_at > now() - interval '2 minutes')
  ) then
    return null;
  end if;

  select value into v_url from private.app_settings where key = 'notification_dispatch_url';
  select value into v_secret from private.app_settings where key = 'notification_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    -- Sending to a push service can take several seconds.
    timeout_milliseconds := 15000
  );
  return null;
end;
$$;

create trigger notifications_dispatch after insert or update of event_count on public.notifications
  for each row execute function private.dispatch_notification();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = public.current_employee_id());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = public.current_employee_id())
  with check (recipient_id = public.current_employee_id());

-- Only the read marker can change through the API. Updates made by other triggers,
-- such as grouping a new chat message into an unread notification, are trusted.
create function public.guard_notification_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Only the read status can be changed.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger notifications_guard_update before update on public.notifications
  for each row execute function public.guard_notification_update();

create policy notification_preferences_all on public.notification_preferences for all to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (employee_id = public.current_employee_id());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (employee_id = public.current_employee_id());

-- A browser belongs to whoever subscribed last, so a shared computer does not keep
-- delivering one person's notifications to the next.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'This push address is not valid.' using errcode = 'check_violation';
  end if;

  insert into public.push_subscriptions (employee_id, endpoint, p256dh, auth, user_agent)
  values (v_actor, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set employee_id = v_actor, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create function public.mark_all_notifications_read()
returns void
language sql security definer set search_path = ''
as $$
  update public.notifications set read_at = now()
  where recipient_id = public.current_employee_id() and read_at is null
$$;
