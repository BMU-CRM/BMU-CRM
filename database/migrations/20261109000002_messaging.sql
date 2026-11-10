-- Internal communication: direct messages, groups, and department, project, client
-- and announcement channels. Membership of the shared channels is worked out from the
-- organisation, so nobody has to maintain member lists for them.

create type public.conversation_kind as enum ('direct', 'group', 'department', 'project', 'client', 'announcement');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  title text check (length(trim(title)) between 1 and 120),
  department_id uuid references public.departments (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  -- For direct messages: both people's ids in order, so each pair has one conversation.
  direct_key text unique,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_kind_link check (
    (kind = 'department') = (department_id is not null)
    and (kind = 'project') = (project_id is not null)
    and (kind = 'client') = (client_id is not null)
    and (kind = 'direct') = (direct_key is not null)
  )
);
create unique index conversations_one_per_department on public.conversations (department_id) where kind = 'department';
create unique index conversations_one_per_project on public.conversations (project_id) where kind = 'project';
create unique index conversations_one_per_client on public.conversations (client_id) where kind = 'client';
create unique index conversations_one_announcement on public.conversations (kind) where kind = 'announcement';

-- Only direct and group conversations have members. The rest follow the organisation.
create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (conversation_id, employee_id)
);
create index conversation_members_employee_idx on public.conversation_members (employee_id);

-- Read positions drive unread counts and read receipts.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, employee_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id uuid references public.employees (id) on delete set null,
  body text not null default '' check (length(body) <= 8000),
  reply_to_id uuid references public.messages (id) on delete set null,
  file_id uuid references public.files (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.employees (id) on delete set null,
  pinned_at timestamptz,
  pinned_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint messages_not_empty check (deleted_at is not null or length(trim(body)) > 0 or file_id is not null)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_file_idx on public.messages (file_id);
create index messages_pinned_idx on public.messages (conversation_id) where pinned_at is not null;

create table public.message_mentions (
  message_id uuid not null references public.messages (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (message_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Who takes part
-- ---------------------------------------------------------------------------

-- The people who belong to a conversation and are notified about it.
create function public.is_conversation_participant(v_conversation public.conversations, p_employee uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.employees where id = p_employee and is_active) then
    return false;
  end if;

  return case v_conversation.kind
    when 'direct' then exists (
      select 1 from public.conversation_members m
      where m.conversation_id = v_conversation.id and m.employee_id = p_employee
    )
    when 'group' then exists (
      select 1 from public.conversation_members m
      where m.conversation_id = v_conversation.id and m.employee_id = p_employee
    )
    when 'department' then exists (
      select 1 from public.employees e
      where e.id = p_employee and e.department_id = v_conversation.department_id
    )
    when 'project' then exists (
      select 1 from public.projects p
      where p.id = v_conversation.project_id and p_employee in (p.project_manager_id, p.created_by)
    ) or exists (
      select 1 from public.project_members m
      where m.project_id = v_conversation.project_id and m.employee_id = p_employee
    )
    when 'client' then exists (
      select 1 from public.clients c
      where c.id = v_conversation.client_id and c.client_manager_id = p_employee
    ) or exists (
      select 1
      from public.projects p
      join public.project_members m on m.project_id = p.id
      where p.client_id = v_conversation.client_id and m.employee_id = p_employee
    )
    else true
  end;
end;
$$;

-- Participants, plus people who oversee the project or client and may read along.
create function public.can_view_conversation_row(v_conversation public.conversations)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or not public.has_permission('messages.use') then
    return false;
  end if;
  if public.is_conversation_participant(v_conversation, v_actor) then
    return true;
  end if;
  return (v_conversation.kind = 'project' and public.can_view_project(v_conversation.project_id))
    or (v_conversation.kind = 'client' and public.can_view_client(v_conversation.client_id));
end;
$$;

create function public.can_view_conversation(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select public.can_view_conversation_row(c) from public.conversations c where c.id = p_conversation),
    false
  )
$$;

create function public.can_post_in_conversation(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_view_conversation(p_conversation)
    and (
      (select kind from public.conversations where id = p_conversation) <> 'announcement'
      or public.has_permission('messages.announce')
    )
$$;

create function public.get_conversation_participant_ids(p_conversation uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id
  from public.employees e, public.conversations c
  where c.id = p_conversation and e.is_active and public.is_conversation_participant(c, e.id)
$$;

-- ---------------------------------------------------------------------------
-- Starting conversations
-- ---------------------------------------------------------------------------

create function public.get_or_create_direct_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_key text;
  v_id uuid;
begin
  if v_actor is null or not public.has_permission('messages.use') then
    raise exception 'You do not have permission to send messages.' using errcode = 'insufficient_privilege';
  end if;
  if p_other = v_actor or not exists (select 1 from public.employees where id = p_other and is_active) then
    raise exception 'You cannot message this person.' using errcode = 'check_violation';
  end if;

  v_key := least(v_actor, p_other)::text || ':' || greatest(v_actor, p_other)::text;

  insert into public.conversations (kind, direct_key, created_by)
  values ('direct', v_key, v_actor)
  on conflict (direct_key) do nothing;

  select id into v_id from public.conversations where direct_key = v_key;

  insert into public.conversation_members (conversation_id, employee_id)
  values (v_id, v_actor), (v_id, p_other)
  on conflict do nothing;

  return v_id;
end;
$$;

create function public.create_group_conversation(p_title text, p_members uuid[])
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_id uuid;
begin
  if v_actor is null or not public.has_permission('messages.use') then
    raise exception 'You do not have permission to send messages.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('group', p_title, v_actor)
  returning id into v_id;

  insert into public.conversation_members (conversation_id, employee_id, is_admin)
  select v_id, e.id, e.id = v_actor
  from public.employees e
  where e.is_active and (e.id = any (p_members) or e.id = v_actor);

  return v_id;
end;
$$;

create function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_view_conversation(p_conversation) then
    return;
  end if;

  insert into public.conversation_reads (conversation_id, employee_id, last_read_at)
  values (p_conversation, public.current_employee_id(), now())
  on conflict (conversation_id, employee_id) do update set last_read_at = now();

  -- Reading the conversation also clears its message and mention notifications.
  update public.notifications
  set read_at = now()
  where recipient_id = public.current_employee_id()
    and read_at is null
    and link = '/messages/' || p_conversation;
end;
$$;

-- The conversation list, with unread counts and the latest message, in one query.
create function public.get_my_conversations()
returns table (
  id uuid,
  kind public.conversation_kind,
  title text,
  department_name text,
  project_name text,
  client_name text,
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
    (
      select e.full_name from public.conversation_members m
      join public.employees e on e.id = m.employee_id
      where c.kind = 'direct' and m.conversation_id = c.id and m.employee_id <> v_actor
      limit 1
    ),
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
    select
      case
        when m.deleted_at is not null then 'Message deleted'
        when length(trim(m.body)) = 0 then 'Sent a file'
        else m.body
      end as body,
      e.full_name as author_name
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

-- ---------------------------------------------------------------------------
-- Channels follow the organisation
-- ---------------------------------------------------------------------------

create function public.create_linked_conversation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'departments' then
    insert into public.conversations (kind, department_id) values ('department', new.id) on conflict do nothing;
  elsif tg_table_name = 'projects' then
    insert into public.conversations (kind, project_id) values ('project', new.id) on conflict do nothing;
  elsif tg_table_name = 'clients' then
    insert into public.conversations (kind, client_id) values ('client', new.id) on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger departments_create_conversation after insert on public.departments
  for each row execute function public.create_linked_conversation();
create trigger projects_create_conversation after insert on public.projects
  for each row execute function public.create_linked_conversation();
create trigger clients_create_conversation after insert on public.clients
  for each row execute function public.create_linked_conversation();

insert into public.conversations (kind, department_id) select 'department', id from public.departments;
insert into public.conversations (kind, project_id) select 'project', id from public.projects;
insert into public.conversations (kind, client_id) select 'client', id from public.clients;
insert into public.conversations (kind, title) values ('announcement', 'Announcements');

-- ---------------------------------------------------------------------------
-- Message rules
-- ---------------------------------------------------------------------------

create function public.guard_message_insert()
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
  return new;
end;
$$;

create trigger messages_guard_insert before insert on public.messages
  for each row execute function public.guard_message_insert();

-- Authors edit and delete their own messages. Anyone who can post can pin. Deleting
-- clears the text from the conversation, while the audit log keeps the original.
create function public.guard_message_update()
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
    new.pinned_at := null;
    new.pinned_by := null;
    return new;
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

create trigger messages_guard_update before update on public.messages
  for each row execute function public.guard_message_update();

-- Keeps the list in order and records mentions written as @Full Name.
create function public.after_message_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  insert into public.message_mentions (message_id, employee_id)
  select new.id, p.id
  from public.get_conversation_participant_ids(new.conversation_id) as p (id)
  join public.employees e on e.id = p.id
  where p.id is distinct from new.author_id
    and position('@' || lower(e.full_name) in lower(new.body)) > 0
  on conflict do nothing;

  return null;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.after_message_insert();

-- Edits and deletions are audited, so the history survives. New messages are not,
-- because the conversation itself is their record.
create trigger messages_audit after update on public.messages
  for each row execute function public.audit_row_change();
create trigger conversation_members_audit after insert or delete on public.conversation_members
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

create function public.is_group_admin(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation and c.kind = 'group'
      and m.employee_id = public.current_employee_id() and m.is_admin
  )
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.messages enable row level security;
alter table public.message_mentions enable row level security;

-- Conversations are created through the functions above, never directly.
create policy conversations_select on public.conversations for select to authenticated
  using (public.can_view_conversation_row(conversations));
create policy conversations_update on public.conversations for update to authenticated
  using (public.is_group_admin(id))
  with check (kind = 'group');

create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.can_view_conversation(conversation_id));
-- Only an admin of a group can add or remove its members. People can always leave.
create policy conversation_members_insert on public.conversation_members for insert to authenticated
  with check (public.is_group_admin(conversation_id));
create policy conversation_members_delete on public.conversation_members for delete to authenticated
  using (
    public.is_group_admin(conversation_id)
    or (
      employee_id = public.current_employee_id()
      and (select kind from public.conversations c where c.id = conversation_members.conversation_id) = 'group'
    )
  );

create policy conversation_reads_select on public.conversation_reads for select to authenticated
  using (public.can_view_conversation(conversation_id));

create policy messages_select on public.messages for select to authenticated
  using (public.can_view_conversation(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.can_post_in_conversation(conversation_id));
-- Field rules are applied by guard_message_update.
create policy messages_update on public.messages for update to authenticated
  using (public.can_view_conversation(conversation_id))
  with check (public.can_view_conversation(conversation_id));

create policy message_mentions_select on public.message_mentions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.can_view_conversation(m.conversation_id)));

-- ---------------------------------------------------------------------------
-- Typing indicators use private real-time channels named conversation:{id}.
-- ---------------------------------------------------------------------------

create function public.can_use_conversation_channel(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id text := split_part(p_topic, ':', 2);
begin
  if split_part(p_topic, ':', 1) <> 'conversation'
     or v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_view_conversation(v_id::uuid);
end;
$$;

create policy conversation_channel_read on realtime.messages for select to authenticated
  using (public.can_use_conversation_channel((select realtime.topic())));
create policy conversation_channel_write on realtime.messages for insert to authenticated
  with check (public.can_use_conversation_channel((select realtime.topic())));
