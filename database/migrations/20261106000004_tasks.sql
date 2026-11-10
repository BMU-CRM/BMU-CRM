-- The task engine: cross-department assignment, a workflow with completion sign-off,
-- subtasks, dependencies, checklists, comments and recurring tasks.

-- "Overdue" is deliberately not a status. It is worked out from the due date, so an
-- overdue task keeps its real state, such as In Progress.
create type public.task_status as enum (
  'not_started', 'assigned', 'accepted', 'in_progress', 'under_review',
  'changes_requested', 'on_hold', 'completed', 'rejected'
);
create type public.task_recurrence as enum ('none', 'daily', 'weekly', 'monthly');

create sequence public.task_code_sequence start 1;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique
    default 'TSK-' || lpad(nextval('public.task_code_sequence')::text, 4, '0'),
  title text not null check (length(trim(title)) between 2 and 200),
  description text,
  created_by uuid references public.employees (id) on delete set null,
  assignee_id uuid references public.employees (id) on delete set null,
  -- Signs off the work. When empty, the person who assigned the task does.
  reviewer_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  parent_task_id uuid references public.tasks (id) on delete restrict,
  status public.task_status not null default 'not_started',
  priority public.work_priority not null default 'medium',
  complexity integer not null default 3 check (complexity between 1 and 5),
  start_date date,
  due_date date,
  estimated_hours numeric(7, 2) check (estimated_hours >= 0),
  actual_hours numeric(7, 2) not null default 0 check (actual_hours >= 0),
  completion_percentage integer not null default 0 check (completion_percentage between 0 and 100),
  reference_links text[] not null default '{}',
  recurrence public.task_recurrence not null default 'none',
  quality_rating integer check (quality_rating between 1 and 5),
  completed_at timestamptz,
  verified_by uuid references public.employees (id) on delete set null,
  escalated_to uuid references public.employees (id) on delete set null,
  escalated_at timestamptz,
  escalation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_dates check (due_date is null or start_date is null or due_date >= start_date),
  constraint tasks_not_own_parent check (parent_task_id is distinct from id)
);
create index tasks_assignee_idx on public.tasks (assignee_id, status);
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_reviewer_idx on public.tasks (reviewer_id);
create index tasks_department_idx on public.tasks (department_id);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_client_idx on public.tasks (client_id);
create index tasks_parent_idx on public.tasks (parent_task_id);
create index tasks_due_date_idx on public.tasks (due_date);

create table public.task_collaborators (
  task_id uuid not null references public.tasks (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, employee_id)
);
create index task_collaborators_employee_idx on public.task_collaborators (employee_id);

create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  constraint task_dependencies_not_self check (task_id <> depends_on_task_id)
);
create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_task_id);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 200),
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index task_checklist_items_task_idx on public.task_checklist_items (task_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

-- ---------------------------------------------------------------------------
-- Access functions
-- ---------------------------------------------------------------------------

-- Who may hand work to whom. Each route is a separate permission, so a role can be
-- given exactly the assignment paths it needs.
create function public.can_assign_task_to(p_target uuid, p_project uuid default null)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('tasks.assign');
  v_actor_department uuid;
  v_target_department uuid;
begin
  if v_actor is null then
    return false;
  end if;

  select department_id into v_target_department
  from public.employees where id = p_target and is_active;
  if not found then
    return false;
  end if;

  if p_target = v_actor then
    return public.has_permission('tasks.create');
  end if;

  if v_scope = 'organisation' then
    return true;
  end if;

  if v_scope = 'department' then
    select department_id into v_actor_department from public.employees where id = v_actor;
    if v_actor_department is not null and v_actor_department = v_target_department then
      return true;
    end if;
  end if;

  if v_scope in ('team', 'department') and public.is_in_reporting_line(p_target, v_actor) then
    return true;
  end if;

  if public.has_permission('tasks.assign_heads') and exists (
    select 1 from public.departments d
    where d.head_employee_id = p_target and d.is_active
  ) then
    return true;
  end if;

  if p_project is not null and public.has_permission('tasks.assign_project_team') then
    return exists (
      select 1 from public.project_members m
      where m.project_id = p_project and m.employee_id = v_actor
    ) and exists (
      select 1 from public.project_members m
      where m.project_id = p_project and m.employee_id = p_target
    );
  end if;

  return false;
end;
$$;

create function public.get_assignable_employee_ids(p_project uuid default null)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.is_active and public.can_assign_task_to(e.id, p_project)
$$;

create function public.can_manage_task(p_task uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('tasks.manage');
  v_task public.tasks;
  v_actor_department uuid;
begin
  if v_actor is null then
    return false;
  end if;

  select * into v_task from public.tasks where id = p_task;
  if not found then
    return false;
  end if;

  if v_task.created_by = v_actor then
    return true;
  end if;
  if v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;

  if v_scope = 'department' then
    select department_id into v_actor_department from public.employees where id = v_actor;
    if v_actor_department is not null and (
      v_task.department_id = v_actor_department
      or exists (
        select 1 from public.employees e
        where e.id = v_task.assignee_id and e.department_id = v_actor_department
      )
    ) then
      return true;
    end if;
  end if;

  return v_task.assignee_id is not null and public.is_in_reporting_line(v_task.assignee_id, v_actor);
end;
$$;

create function public.can_view_task_row(v_task public.tasks)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('tasks.view');
  v_actor_department uuid;
begin
  if v_actor is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;

  -- Anyone involved in a task can always see it.
  if v_actor in (v_task.created_by, v_task.assignee_id, v_task.reviewer_id, v_task.escalated_to)
     or exists (
       select 1 from public.task_collaborators c
       where c.task_id = v_task.id and c.employee_id = v_actor
     ) then
    return true;
  end if;

  if v_scope = 'department' then
    select department_id into v_actor_department from public.employees where id = v_actor;
    if v_actor_department is not null and (
      v_task.department_id = v_actor_department
      or exists (
        select 1 from public.employees e
        where e.id = v_task.assignee_id and e.department_id = v_actor_department
      )
    ) then
      return true;
    end if;
  end if;

  if v_scope in ('team', 'department') then
    return v_task.assignee_id is not null and public.is_in_reporting_line(v_task.assignee_id, v_actor);
  end if;

  return false;
end;
$$;

create function public.can_view_task(p_task uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_task_row(t) from public.tasks t where t.id = p_task), false)
$$;

-- People doing the work: the assignee, collaborators and those who manage the task.
create function public.can_work_on_task(p_task uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_manage_task(p_task)
    or exists (
      select 1 from public.tasks t
      where t.id = p_task and t.assignee_id = public.current_employee_id()
    )
    or exists (
      select 1 from public.task_collaborators c
      where c.task_id = p_task and c.employee_id = public.current_employee_id()
    )
$$;

-- ---------------------------------------------------------------------------
-- Rules for creating and changing tasks
-- ---------------------------------------------------------------------------

-- Fills in linked details. pg_trigger_depth above 1 means another trigger created the
-- task, such as the next run of a recurring task, so the assignment checks are skipped.
create function public.guard_task_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_parent public.tasks;
  v_project_client uuid;
  v_project_department uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.parent_task_id is not null then
    select * into v_parent from public.tasks where id = new.parent_task_id;
    new.project_id := coalesce(new.project_id, v_parent.project_id);
    new.client_id := coalesce(new.client_id, v_parent.client_id);
    new.department_id := coalesce(new.department_id, v_parent.department_id);
  end if;

  if new.project_id is not null then
    select client_id, department_id into v_project_client, v_project_department
    from public.projects where id = new.project_id;
    new.client_id := coalesce(new.client_id, v_project_client);
  end if;

  if (select auth.uid()) is not null then
    if v_actor is null then
      raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
    end if;
    new.created_by := v_actor;

    if not public.has_permission('tasks.create') then
      raise exception 'You do not have permission to create tasks.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.assignee_id is not null and not public.can_assign_task_to(new.assignee_id, new.project_id) then
      raise exception 'You cannot assign work to this person.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.project_id is not null and not public.can_view_project(new.project_id) then
      raise exception 'You do not have access to this project.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.parent_task_id is not null and not public.can_work_on_task(new.parent_task_id) then
      raise exception 'You cannot add subtasks to this task.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.department_id is null then
    select department_id into new.department_id
    from public.employees where id = coalesce(new.assignee_id, new.created_by);
    new.department_id := coalesce(new.department_id, v_project_department);
  end if;

  new.completion_percentage := 0;
  new.completed_at := null;
  new.verified_by := null;
  new.quality_rating := null;
  new.status := case
    when new.assignee_id is null then 'not_started'
    when new.assignee_id = new.created_by then 'accepted'
    else 'assigned'
  end::public.task_status;

  return new;
end;
$$;

create trigger tasks_guard_insert before insert on public.tasks
  for each row execute function public.guard_task_insert();

create function public.guard_task_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_assignee boolean;
  v_is_self_task boolean;
  v_can_manage boolean;
  v_can_review boolean;
  v_allowed boolean := false;
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;

  v_is_assignee := old.assignee_id = v_actor;
  v_is_self_task := old.assignee_id = old.created_by;
  -- A manager cannot change the terms of work assigned to them by someone else.
  v_can_manage := public.can_manage_task(old.id)
    and (old.assignee_id is distinct from v_actor or old.created_by = v_actor);
  -- Completion must be signed off by someone other than the person who did the work,
  -- unless they set the task for themselves.
  v_can_review := (
      old.created_by = v_actor
      or old.reviewer_id = v_actor
      or public.can_manage_task(old.id)
    ) and (old.assignee_id is distinct from v_actor or v_is_self_task);

  if new.task_code is distinct from old.task_code
     or new.created_by is distinct from old.created_by
     or new.parent_task_id is distinct from old.parent_task_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if not v_can_manage and (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.priority is distinct from old.priority
    or new.complexity is distinct from old.complexity
    or new.start_date is distinct from old.start_date
    or new.due_date is distinct from old.due_date
    or new.estimated_hours is distinct from old.estimated_hours
    or new.department_id is distinct from old.department_id
    or new.client_id is distinct from old.client_id
    or new.project_id is distinct from old.project_id
    or new.reviewer_id is distinct from old.reviewer_id
    or new.reference_links is distinct from old.reference_links
    or new.recurrence is distinct from old.recurrence
  ) then
    raise exception 'You do not have permission to change these task details.'
      using errcode = 'insufficient_privilege';
  end if;

  if not (v_is_assignee or v_can_manage) and (
    new.completion_percentage is distinct from old.completion_percentage
    or new.actual_hours is distinct from old.actual_hours
  ) then
    raise exception 'Only the assignee or a manager can update progress.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.quality_rating is distinct from old.quality_rating and not v_can_review then
    raise exception 'Only the reviewer can rate the work.' using errcode = 'insufficient_privilege';
  end if;

  if new.verified_by is distinct from old.verified_by
     or new.completed_at is distinct from old.completed_at then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if new.escalated_to is distinct from old.escalated_to then
    if not (v_is_assignee or public.can_manage_task(old.id) or old.created_by = v_actor) then
      raise exception 'You cannot escalate this task.' using errcode = 'insufficient_privilege';
    end if;
    if new.escalated_to is not null and not (
      new.escalated_to = old.created_by
      or (old.assignee_id is not null and public.is_in_reporting_line(old.assignee_id, new.escalated_to))
    ) then
      raise exception 'A task can only be escalated up the reporting line.'
        using errcode = 'check_violation';
    end if;
    new.escalated_at := case when new.escalated_to is null then null else now() end;
  elsif new.escalated_at is distinct from old.escalated_at then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not v_can_manage then
      raise exception 'You do not have permission to reassign this task.'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'completed' then
      raise exception 'A completed task cannot be reassigned.' using errcode = 'check_violation';
    end if;
    if new.assignee_id is not null
       and not public.can_assign_task_to(new.assignee_id, coalesce(new.project_id, old.project_id)) then
      raise exception 'You cannot assign work to this person.'
        using errcode = 'insufficient_privilege';
    end if;
    new.status := case
      when new.assignee_id is null then 'not_started'
      when new.assignee_id = old.created_by then 'accepted'
      else 'assigned'
    end::public.task_status;
    return new;
  end if;

  if new.status is distinct from old.status then
    if v_is_assignee and (
      (old.status = 'assigned' and new.status in ('accepted', 'rejected'))
      or (old.status = 'accepted' and new.status in ('in_progress', 'on_hold'))
      or (old.status = 'in_progress' and new.status in ('under_review', 'on_hold'))
      or (old.status = 'on_hold' and new.status = 'in_progress')
      or (old.status = 'changes_requested' and new.status = 'in_progress')
    ) then
      v_allowed := true;
    end if;

    if v_is_assignee and v_is_self_task and old.reviewer_id is null
       and old.status = 'in_progress' and new.status = 'completed' then
      v_allowed := true;
    end if;

    if v_can_review and old.status = 'under_review'
       and new.status in ('completed', 'changes_requested') then
      v_allowed := true;
    end if;

    if v_can_manage and (
      (new.status = 'on_hold' and old.status not in ('completed', 'rejected'))
      or (old.status = 'on_hold' and new.status = 'in_progress')
      or (old.status = 'completed' and new.status = 'in_progress')
    ) then
      v_allowed := true;
    end if;

    if not v_allowed then
      raise exception 'You cannot move this task from % to %.',
        replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')
        using errcode = 'insufficient_privilege';
    end if;

    if new.status in ('in_progress', 'under_review', 'completed') and exists (
      select 1
      from public.task_dependencies d
      join public.tasks blocker on blocker.id = d.depends_on_task_id
      where d.task_id = old.id and blocker.status <> 'completed'
    ) then
      raise exception 'This task is waiting for another task to be completed.'
        using errcode = 'check_violation';
    end if;

    if new.status = 'completed' then
      if exists (
        select 1 from public.tasks s
        where s.parent_task_id = old.id and s.status not in ('completed', 'rejected')
      ) then
        raise exception 'Finish the subtasks before completing this task.'
          using errcode = 'check_violation';
      end if;
      new.completed_at := now();
      new.completion_percentage := 100;
      new.verified_by := case when v_is_assignee then null else v_actor end;
    elsif old.status = 'completed' then
      new.completed_at := null;
      new.verified_by := null;
      new.quality_rating := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_guard_update before update on public.tasks
  for each row execute function public.guard_task_update();

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger task_comments_set_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();
create trigger task_comments_stamp_created_by before insert or update on public.task_comments
  for each row execute function public.stamp_created_by();

-- A task cannot wait for something that is waiting for it, at any depth.
create function public.prevent_dependency_cycle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_found boolean;
begin
  with recursive chain as (
    select d.depends_on_task_id, 1 as depth
    from public.task_dependencies d
    where d.task_id = new.depends_on_task_id
    union all
    select d.depends_on_task_id, c.depth + 1
    from public.task_dependencies d
    join chain c on d.task_id = c.depends_on_task_id
    where c.depth < 100
  )
  select exists (select 1 from chain where depends_on_task_id = new.task_id) into v_found;

  if v_found then
    raise exception 'These tasks would be waiting for each other.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_prevent_cycle before insert on public.task_dependencies
  for each row execute function public.prevent_dependency_cycle();

-- Completing a recurring task schedules its next run, so no background job is needed.
create function public.create_next_recurring_task()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_step interval;
  v_next_id uuid;
begin
  if new.recurrence = 'none' or new.parent_task_id is not null
     or new.status <> 'completed' or old.status = 'completed' then
    return null;
  end if;

  v_step := case new.recurrence
    when 'daily' then interval '1 day'
    when 'weekly' then interval '1 week'
    else interval '1 month'
  end;

  insert into public.tasks (
    title, description, created_by, assignee_id, reviewer_id, department_id, client_id,
    project_id, status, priority, complexity, start_date, due_date, estimated_hours,
    reference_links, recurrence
  )
  values (
    new.title, new.description, new.created_by, new.assignee_id, new.reviewer_id,
    new.department_id, new.client_id, new.project_id,
    case
      when new.assignee_id is null then 'not_started'
      when new.assignee_id = new.created_by then 'accepted'
      else 'assigned'
    end::public.task_status,
    new.priority, new.complexity,
    (new.start_date + v_step)::date,
    (coalesce(new.due_date, current_date) + v_step)::date,
    new.estimated_hours, new.reference_links, new.recurrence
  )
  returning id into v_next_id;

  insert into public.task_checklist_items (task_id, label)
  select v_next_id, label from public.task_checklist_items where task_id = new.id;

  return null;
end;
$$;

create trigger tasks_create_next_recurring after update of status on public.tasks
  for each row execute function public.create_next_recurring_task();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.task_collaborators enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_comments enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (public.can_view_task_row(tasks));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.has_permission('tasks.create'));
-- Field-level rules are applied by guard_task_update.
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_view_task_row(tasks))
  with check (public.current_employee_id() is not null);
-- Work that has started stays on record.
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_manage_task(id) and status in ('not_started', 'assigned'));

create policy task_collaborators_select on public.task_collaborators for select to authenticated
  using (public.can_view_task(task_id));
create policy task_collaborators_insert on public.task_collaborators for insert to authenticated
  with check (public.can_manage_task(task_id));
create policy task_collaborators_delete on public.task_collaborators for delete to authenticated
  using (public.can_manage_task(task_id));

create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (public.can_view_task(task_id));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (public.can_manage_task(task_id) and public.can_view_task(depends_on_task_id));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (public.can_manage_task(task_id));

create policy task_checklist_items_select on public.task_checklist_items for select to authenticated
  using (public.can_view_task(task_id));
create policy task_checklist_items_insert on public.task_checklist_items for insert to authenticated
  with check (public.can_work_on_task(task_id));
create policy task_checklist_items_update on public.task_checklist_items for update to authenticated
  using (public.can_work_on_task(task_id))
  with check (public.can_work_on_task(task_id));
create policy task_checklist_items_delete on public.task_checklist_items for delete to authenticated
  using (public.can_work_on_task(task_id));

create policy task_comments_select on public.task_comments for select to authenticated
  using (public.can_view_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (public.can_view_task(task_id));
create policy task_comments_update on public.task_comments for update to authenticated
  using (created_by = public.current_employee_id())
  with check (created_by = public.current_employee_id());
