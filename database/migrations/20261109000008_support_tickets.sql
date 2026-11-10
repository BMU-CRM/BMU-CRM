-- Support tickets, routed by category to the department that handles them.

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  description text check (length(description) <= 300),
  handling_department_id uuid references public.departments (id) on delete set null,
  default_assignee_id uuid references public.employees (id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index ticket_categories_name_unique on public.ticket_categories (lower(name));

insert into public.ticket_categories (name, description, handling_department_id, sort_order)
select c.name, c.description, d.id, c.sort_order
from (values
  ('Technical issue', 'Something is broken or not working as expected.', 'Design & Development', 10),
  ('Software problem', 'An app, tool or licence needs attention.', 'Design & Development', 20),
  ('Hardware requirement', 'A laptop, screen or other equipment.', 'Design & Development', 30),
  ('Access permission', 'Access to a system, account or folder.', 'Management', 40),
  ('HR', 'Leave, payroll queries and other people matters.', 'Management', 50),
  ('Finance', 'Reimbursements, payments and invoices.', 'Finance', 60),
  ('General administration', 'Anything else for the office.', 'Management', 70)
) as c (name, description, department_name, sort_order)
left join public.departments d on d.name = c.department_name;

create type public.ticket_status as enum ('open', 'assigned', 'in_progress', 'waiting_for_response', 'resolved', 'closed');

create sequence public.ticket_code_sequence start 1;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique
    default 'TKT-' || lpad(nextval('public.ticket_code_sequence')::text, 4, '0'),
  title text not null check (length(trim(title)) between 3 and 200),
  description text not null check (length(trim(description)) between 3 and 8000),
  category_id uuid not null references public.ticket_categories (id) on delete restrict,
  priority public.work_priority not null default 'medium',
  requester_id uuid references public.employees (id) on delete set null,
  requester_department_id uuid references public.departments (id) on delete set null,
  handling_department_id uuid references public.departments (id) on delete set null,
  assigned_to uuid references public.employees (id) on delete set null,
  status public.ticket_status not null default 'open',
  resolution text check (length(resolution) <= 4000),
  assigned_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_requester_idx on public.tickets (requester_id);
create index tickets_assignee_idx on public.tickets (assigned_to, status);
create index tickets_department_idx on public.tickets (handling_department_id, status);

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);

-- Attachments for meetings and tickets reuse the file system.
alter table public.files add column meeting_id uuid references public.meetings (id) on delete set null;
alter table public.files add column ticket_id uuid references public.tickets (id) on delete set null;
create index files_meeting_idx on public.files (meeting_id);
create index files_ticket_idx on public.files (ticket_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Handlers are the assignee, the handling department at department scope, or anyone
-- at organisation scope.
create function public.can_manage_ticket_row(v_ticket public.tickets)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('tickets.manage');
begin
  if v_actor is null then
    return false;
  end if;
  if v_ticket.assigned_to = v_actor or v_scope = 'organisation' then
    return true;
  end if;
  return v_scope = 'department' and v_ticket.handling_department_id is not null
    and v_ticket.handling_department_id = (select department_id from public.employees where id = v_actor);
end;
$$;

create function public.can_view_ticket_row(v_ticket public.tickets)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select v_ticket.requester_id = public.current_employee_id() or public.can_manage_ticket_row(v_ticket)
$$;

create function public.can_view_ticket(p_ticket uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_ticket_row(t) from public.tickets t where t.id = p_ticket), false)
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

create function public.guard_ticket_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_category public.ticket_categories;
begin
  if (select auth.uid()) is not null then
    if not public.has_permission('tickets.create') then
      raise exception 'You do not have permission to raise tickets.' using errcode = 'insufficient_privilege';
    end if;
    new.requester_id := public.current_employee_id();
  end if;

  select * into v_category from public.ticket_categories where id = new.category_id and is_active;
  if not found then
    raise exception 'Choose a valid category.' using errcode = 'check_violation';
  end if;

  select department_id into new.requester_department_id from public.employees where id = new.requester_id;
  new.handling_department_id := v_category.handling_department_id;
  new.resolution := null;
  new.resolved_at := null;
  new.closed_at := null;

  if v_category.default_assignee_id is not null
     and exists (select 1 from public.employees where id = v_category.default_assignee_id and is_active) then
    new.assigned_to := v_category.default_assignee_id;
    new.assigned_at := now();
    new.status := 'assigned';
  else
    new.assigned_to := null;
    new.assigned_at := null;
    new.status := 'open';
  end if;
  return new;
end;
$$;

create trigger tickets_guard_insert before insert on public.tickets
  for each row execute function public.guard_ticket_insert();

-- Requesters can edit an unhandled ticket, close a resolved one, reopen it, or answer a
-- question. Handlers move it through the workflow, and must record a resolution.
create function public.guard_ticket_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_handler boolean := public.can_manage_ticket_row(old);
  v_is_requester boolean := old.requester_id = v_actor;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.ticket_code is distinct from old.ticket_code
     or new.requester_id is distinct from old.requester_id
     or new.requester_department_id is distinct from old.requester_department_id
     or new.handling_department_id is distinct from old.handling_department_id
     or new.category_id is distinct from old.category_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if (new.title is distinct from old.title or new.description is distinct from old.description)
     and not (v_is_requester and old.status in ('open', 'assigned')) then
    raise exception 'The ticket can only be edited before work starts.' using errcode = 'insufficient_privilege';
  end if;

  if (new.priority is distinct from old.priority or new.assigned_to is distinct from old.assigned_to
      or new.resolution is distinct from old.resolution) and not v_is_handler then
    raise exception 'Only the support team can change this.' using errcode = 'insufficient_privilege';
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is not null and not exists (
      select 1 from public.employees e
      where e.id = new.assigned_to and e.is_active
        and (public.permission_scope_for('tickets.manage') = 'organisation'
             or e.department_id = old.handling_department_id)
    ) then
      raise exception 'Assign the ticket to someone in the handling department.' using errcode = 'check_violation';
    end if;
    new.assigned_at := now();
    if new.status = old.status and old.status in ('open', 'assigned') then
      new.status := case when new.assigned_to is null then 'open' else 'assigned' end::public.ticket_status;
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (v_is_handler and new.status <> 'closed')
      or (v_is_handler and new.status = 'closed' and old.status = 'resolved')
      or (v_is_requester and old.status = 'resolved' and new.status in ('closed', 'open'))
      or (v_is_requester and old.status = 'closed' and new.status = 'open')
      or (v_is_requester and old.status = 'waiting_for_response' and new.status = 'in_progress')
    ) then
      raise exception 'You cannot move this ticket from % to %.',
        replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')
        using errcode = 'insufficient_privilege';
    end if;

    if new.status = 'resolved' then
      if coalesce(trim(new.resolution), '') = '' then
        raise exception 'Describe how the ticket was resolved.' using errcode = 'check_violation';
      end if;
      new.resolved_at := now();
    elsif new.status = 'closed' then
      new.closed_at := now();
    elsif new.status = 'open' then
      new.resolved_at := null;
      new.closed_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger tickets_guard_update before update on public.tickets
  for each row execute function public.guard_ticket_update();

create trigger ticket_comments_stamp_created_by before insert or update on public.ticket_comments
  for each row execute function public.stamp_created_by();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create function public.notify_ticket_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_link text := '/tickets/' || new.id;
  v_summary text := new.ticket_code || ': ' || new.title;
  v_head uuid;
  v_priority public.notification_priority :=
    case when new.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority;
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      perform public.notify(new.assigned_to, 'ticket_raised', 'A support ticket was assigned to you', v_summary, v_link, v_priority);
    else
      select head_employee_id into v_head from public.departments where id = new.handling_department_id;
      perform public.notify(v_head, 'ticket_raised', 'A new support ticket needs attention', v_summary, v_link, v_priority);
    end if;
    return null;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    perform public.notify(new.assigned_to, 'ticket_raised', 'A support ticket was assigned to you', v_summary, v_link, v_priority);
  end if;
  if new.status is distinct from old.status then
    perform public.notify(new.requester_id, 'ticket_updated',
      'Your ticket is now ' || replace(new.status::text, '_', ' '), v_summary, v_link,
      case when new.status in ('resolved', 'waiting_for_response') then 'high' else 'normal' end::public.notification_priority);
    if new.status in ('open', 'in_progress') and old.status in ('resolved', 'closed', 'waiting_for_response') then
      perform public.notify(new.assigned_to, 'ticket_updated', 'A ticket needs your attention again', v_summary, v_link);
    end if;
  end if;
  return null;
end;
$$;

create trigger tickets_notify after insert or update on public.tickets
  for each row execute function public.notify_ticket_events();

create function public.notify_ticket_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  perform public.notify(v_ticket.requester_id, 'ticket_updated', 'New reply on your ticket',
    v_ticket.ticket_code || ': ' || new.body, '/tickets/' || new.ticket_id, 'normal', 'ticket-comment:' || new.ticket_id);
  perform public.notify(v_ticket.assigned_to, 'ticket_updated', 'New reply on a ticket',
    v_ticket.ticket_code || ': ' || new.body, '/tickets/' || new.ticket_id, 'normal', 'ticket-comment:' || new.ticket_id);
  return null;
end;
$$;

create trigger ticket_comments_notify after insert on public.ticket_comments
  for each row execute function public.notify_ticket_comment();

-- ---------------------------------------------------------------------------
-- Files can now belong to meetings and tickets too.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_file_row(v_file public.files)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('files.view');
  v_department uuid;
begin
  if v_actor is null then
    return false;
  end if;
  if v_file.status = 'uploading' then
    return v_file.owner_id = v_actor;
  end if;
  if v_scope = 'organisation' or v_file.owner_id = v_actor then
    return true;
  end if;

  select department_id into v_department from public.employees where id = v_actor;

  if exists (
    select 1 from public.file_shares s
    where s.file_id = v_file.id
      and (s.expires_at is null or s.expires_at > now())
      and (s.recipient_employee_id = v_actor or (v_department is not null and s.recipient_department_id = v_department))
  ) then
    return true;
  end if;

  if (v_file.task_id is not null and public.can_view_task(v_file.task_id))
     or (v_file.project_id is not null and public.can_view_project(v_file.project_id))
     or (v_file.client_id is not null and public.can_view_client(v_file.client_id))
     or (v_file.meeting_id is not null and public.can_view_meeting(v_file.meeting_id))
     or (v_file.ticket_id is not null and public.can_view_ticket(v_file.ticket_id)) then
    return true;
  end if;

  if v_scope = 'department' and v_department is not null and v_file.department_id = v_department then
    return true;
  end if;

  return exists (
    select 1 from public.messages m
    where m.file_id = v_file.id and m.deleted_at is null and public.can_view_conversation(m.conversation_id)
  );
end;
$$;

create function public.check_file_record_links()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    (new.meeting_id is not null and (tg_op = 'INSERT' or new.meeting_id is distinct from old.meeting_id)
      and not public.can_view_meeting(new.meeting_id))
    or (new.ticket_id is not null and (tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id)
      and not public.can_view_ticket(new.ticket_id))
  ) then
    raise exception 'You cannot attach files to that record.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger files_check_record_links before insert or update of meeting_id, ticket_id on public.files
  for each row execute function public.check_file_record_links();

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger tickets_set_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();
create trigger ticket_comments_set_updated_at before update on public.ticket_comments
  for each row execute function public.set_updated_at();
create trigger tickets_audit after insert or update on public.tickets
  for each row execute function public.audit_row_change();
create trigger ticket_categories_audit after insert or update or delete on public.ticket_categories
  for each row execute function public.audit_row_change();

alter table public.ticket_categories enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;

create policy ticket_categories_select on public.ticket_categories for select to authenticated
  using (public.current_employee_id() is not null);
create policy ticket_categories_write on public.ticket_categories for all to authenticated
  using (public.permission_scope_for('tickets.manage') = 'organisation')
  with check (public.permission_scope_for('tickets.manage') = 'organisation');

create policy tickets_select on public.tickets for select to authenticated
  using (public.can_view_ticket_row(tickets));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.has_permission('tickets.create'));
-- Field rules are applied by guard_ticket_update.
create policy tickets_update on public.tickets for update to authenticated
  using (public.can_view_ticket_row(tickets))
  with check (public.current_employee_id() is not null);

create policy ticket_comments_select on public.ticket_comments for select to authenticated
  using (public.can_view_ticket(ticket_id));
create policy ticket_comments_insert on public.ticket_comments for insert to authenticated
  with check (public.can_view_ticket(ticket_id));
create policy ticket_comments_update on public.ticket_comments for update to authenticated
  using (created_by = public.current_employee_id())
  with check (created_by = public.current_employee_id());
