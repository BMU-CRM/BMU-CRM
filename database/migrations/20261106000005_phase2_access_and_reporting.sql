-- Phase 2 permissions, audit coverage, reporting functions, grants and real-time updates.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('clients.view', 'Clients', 'View clients', 'Open client profiles and Client 360.', '{own,department,organisation}', 200),
  ('clients.create', 'Clients', 'Add clients', 'Add leads and clients.', '{organisation}', 210),
  ('clients.update', 'Clients', 'Edit clients', 'Change client details, notes, requirements and services.', '{own,department,organisation}', 220),
  ('projects.view', 'Projects', 'View projects', 'See projects and their progress.', '{own,team,department,organisation}', 300),
  ('projects.create', 'Projects', 'Create projects', 'Start new projects.', '{department,organisation}', 310),
  ('projects.update', 'Projects', 'Manage projects', 'Change projects, teams and milestones.', '{own,department,organisation}', 320),
  ('tasks.view', 'Tasks', 'View tasks', 'See tasks beyond those you are involved in.', '{own,team,department,organisation}', 400),
  ('tasks.create', 'Tasks', 'Create tasks', 'Create tasks for yourself.', '{own}', 410),
  ('tasks.assign', 'Tasks', 'Assign tasks', 'Give tasks to other people.', '{team,department,organisation}', 420),
  ('tasks.assign_heads', 'Tasks', 'Assign to department heads', 'Give tasks to the head of any department.', '{organisation}', 430),
  ('tasks.assign_project_team', 'Tasks', 'Assign within project teams', 'Give tasks to people on the same project.', '{own}', 440),
  ('tasks.manage', 'Tasks', 'Manage tasks', 'Edit, reassign and review tasks you did not create.', '{team,department,organisation}', 450),
  ('workload.view', 'Tasks', 'View workload', 'See workload and performance figures.', '{team,department,organisation}', 460);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.sort_order >= 200;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, m.scope::public.permission_scope
from (values
  ('Co-Founder', 'clients.view', 'organisation'),
  ('Co-Founder', 'clients.create', 'organisation'),
  ('Co-Founder', 'clients.update', 'organisation'),
  ('Co-Founder', 'projects.view', 'organisation'),
  ('Co-Founder', 'projects.create', 'organisation'),
  ('Co-Founder', 'projects.update', 'organisation'),
  ('Co-Founder', 'tasks.view', 'organisation'),
  ('Co-Founder', 'tasks.create', 'own'),
  ('Co-Founder', 'tasks.assign', 'organisation'),
  ('Co-Founder', 'tasks.assign_heads', 'organisation'),
  ('Co-Founder', 'tasks.manage', 'organisation'),
  ('Co-Founder', 'workload.view', 'organisation'),

  ('Client Manager', 'clients.view', 'organisation'),
  ('Client Manager', 'clients.create', 'organisation'),
  ('Client Manager', 'clients.update', 'own'),
  ('Client Manager', 'projects.view', 'organisation'),
  ('Client Manager', 'projects.create', 'organisation'),
  ('Client Manager', 'projects.update', 'own'),
  ('Client Manager', 'tasks.view', 'organisation'),
  ('Client Manager', 'tasks.create', 'own'),
  ('Client Manager', 'tasks.assign', 'team'),
  ('Client Manager', 'tasks.assign_heads', 'organisation'),
  ('Client Manager', 'tasks.manage', 'team'),
  ('Client Manager', 'workload.view', 'team'),

  ('Branch Manager', 'projects.view', 'department'),
  ('Branch Manager', 'tasks.view', 'department'),
  ('Branch Manager', 'tasks.create', 'own'),
  ('Branch Manager', 'tasks.assign', 'department'),
  ('Branch Manager', 'tasks.assign_heads', 'organisation'),
  ('Branch Manager', 'tasks.manage', 'department'),
  ('Branch Manager', 'workload.view', 'department'),

  ('Finance Head', 'clients.view', 'organisation'),
  ('Finance Head', 'projects.view', 'department'),
  ('Finance Head', 'tasks.view', 'department'),
  ('Finance Head', 'tasks.create', 'own'),
  ('Finance Head', 'tasks.assign', 'department'),
  ('Finance Head', 'tasks.assign_heads', 'organisation'),
  ('Finance Head', 'tasks.manage', 'department'),
  ('Finance Head', 'workload.view', 'department'),

  ('Design & Development Head', 'clients.view', 'department'),
  ('Design & Development Head', 'projects.view', 'department'),
  ('Design & Development Head', 'projects.create', 'department'),
  ('Design & Development Head', 'projects.update', 'department'),
  ('Design & Development Head', 'tasks.view', 'department'),
  ('Design & Development Head', 'tasks.create', 'own'),
  ('Design & Development Head', 'tasks.assign', 'department'),
  ('Design & Development Head', 'tasks.assign_heads', 'organisation'),
  ('Design & Development Head', 'tasks.manage', 'department'),
  ('Design & Development Head', 'workload.view', 'department'),

  ('Digital Marketing Head', 'clients.view', 'department'),
  ('Digital Marketing Head', 'projects.view', 'department'),
  ('Digital Marketing Head', 'projects.create', 'department'),
  ('Digital Marketing Head', 'projects.update', 'department'),
  ('Digital Marketing Head', 'tasks.view', 'department'),
  ('Digital Marketing Head', 'tasks.create', 'own'),
  ('Digital Marketing Head', 'tasks.assign', 'department'),
  ('Digital Marketing Head', 'tasks.assign_heads', 'organisation'),
  ('Digital Marketing Head', 'tasks.manage', 'department'),
  ('Digital Marketing Head', 'workload.view', 'department'),

  ('Employee', 'projects.view', 'own'),
  ('Employee', 'tasks.view', 'own'),
  ('Employee', 'tasks.create', 'own')
) as m (role_name, permission_key, scope)
join public.roles r on r.name = m.role_name;

-- ---------------------------------------------------------------------------
-- Audit coverage. Entries now carry the client they relate to, which is what feeds
-- the Client 360 timeline. Any later table with a client_id joins it automatically.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column client_id uuid;
create index audit_logs_client_idx on public.audit_logs (client_id, id desc);

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_details jsonb;
  v_action text;
  v_label text;
  v_client text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_details := jsonb_build_object('deleted', v_row);
    v_action := 'deleted';
  elsif tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_details := jsonb_build_object('created', v_row);
    v_action := 'created';
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    select jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value))
      into v_details
    from jsonb_each(v_new) n
    where n.key <> 'updated_at' and n.value is distinct from v_old -> n.key;
    if v_details is null then
      return new;
    end if;
    v_details := jsonb_build_object('changes', v_details);
    v_action := 'updated';
  end if;

  if v_actor is not null then
    select full_name into v_actor_name from public.employees where id = v_actor;
  end if;

  -- The name is copied in, so an entry stays readable if the record later changes.
  v_label := coalesce(
    v_row ->> 'full_name', v_row ->> 'company_name', v_row ->> 'name',
    v_row ->> 'title', v_row ->> 'service_name'
  );
  if tg_table_name = 'role_permissions' then
    select r.name || ': ' || (v_row ->> 'permission_key') into v_label
    from public.roles r
    where r.id = (v_row ->> 'role_id')::uuid;
  end if;
  v_details := v_details || jsonb_build_object('label', v_label);

  v_client := coalesce(v_row ->> 'client_id', case when tg_table_name = 'clients' then v_row ->> 'id' end);

  insert into public.audit_logs (
    actor_employee_id, actor_name, action, entity_type, entity_id, client_id, details
  )
  values (
    v_actor,
    coalesce(v_actor_name, 'System'),
    v_action,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'role_id', v_row ->> 'project_id'),
    v_client::uuid,
    v_details
  );

  return coalesce(new, old);
end;
$$;

create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function public.audit_row_change();
create trigger client_records_audit after insert or update or delete on public.client_records
  for each row execute function public.audit_row_change();
create trigger client_services_audit after insert or update or delete on public.client_services
  for each row execute function public.audit_row_change();
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();
create trigger project_members_audit after insert or delete on public.project_members
  for each row execute function public.audit_row_change();
create trigger project_milestones_audit after insert or update or delete on public.project_milestones
  for each row execute function public.audit_row_change();
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Reporting functions
-- ---------------------------------------------------------------------------

-- Returns which fields changed, not their values. Someone who can see a client may
-- not be allowed to see the detail of every task linked to it.
create function public.get_client_timeline(p_client uuid, p_limit integer default 100)
returns table (
  id bigint, actor_name text, action text, entity_type text, details jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_view_client(p_client) then
    return;
  end if;

  return query
  select a.id, a.actor_name, a.action, a.entity_type,
    jsonb_build_object(
      'label', a.details -> 'label',
      'changes', (
        select jsonb_object_agg(key, true)
        from jsonb_object_keys(coalesce(a.details -> 'changes', '{}'::jsonb)) as key
      )
    ),
    a.created_at
  from public.audit_logs a
  where a.client_id = p_client
  order by a.id desc
  limit least(p_limit, 500);
end;
$$;

create function public.get_task_history(p_task uuid)
returns table (
  id bigint, actor_name text, action text, details jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_view_task(p_task) then
    return;
  end if;

  return query
  select a.id, a.actor_name, a.action, a.details, a.created_at
  from public.audit_logs a
  where a.entity_type = 'tasks' and a.entity_id = p_task::text
  order by a.id desc
  limit 100;
end;
$$;

-- Lets people see which client their work is for, without opening the client's record.
create function public.get_client_labels(p_clients uuid[])
returns table (id uuid, company_name text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.company_name
  from public.clients c
  where public.current_employee_id() is not null and c.id = any (p_clients)
$$;

create function public.get_project_progress(p_projects uuid[])
returns table (
  project_id uuid, total_tasks bigint, completed_tasks bigint, overdue_tasks bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    p.id,
    count(t.id),
    count(t.id) filter (where t.status = 'completed'),
    count(t.id) filter (
      where t.due_date < (now() at time zone 'Asia/Kolkata')::date and t.status not in ('completed', 'rejected')
    )
  from public.projects p
  left join public.tasks t
    on t.project_id = p.id and t.parent_task_id is null and t.status <> 'rejected'
  where p.id = any (p_projects) and public.can_view_project(p.id)
  group by p.id
$$;

-- One row per open or recently finished task, plus one empty row for anyone without
-- tasks, so that free capacity shows up too.
create function public.get_workload_rows()
returns table (
  employee_id uuid,
  full_name text,
  department_name text,
  designation_title text,
  task_id uuid,
  status public.task_status,
  priority public.work_priority,
  complexity integer,
  estimated_hours numeric,
  actual_hours numeric,
  completion_percentage integer,
  quality_rating integer,
  due_date date,
  completed_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('workload.view');
  v_department uuid;
begin
  if v_actor is null or v_scope is null then
    return;
  end if;

  select e.department_id into v_department from public.employees e where e.id = v_actor;

  return query
  select
    e.id, e.full_name, d.name, g.title,
    t.id, t.status, t.priority, t.complexity, t.estimated_hours, t.actual_hours,
    t.completion_percentage, t.quality_rating, t.due_date, t.completed_at
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.designations g on g.id = e.designation_id
  left join public.tasks t on t.assignee_id = e.id and (
    t.status not in ('completed', 'rejected')
    or t.completed_at > now() - interval '90 days'
  )
  where e.is_active and (
    v_scope = 'organisation'
    or e.id = v_actor
    or (v_scope = 'department' and e.department_id = v_department)
    or public.is_in_reporting_line(e.id, v_actor)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions are open to anon by default, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update on public.clients to authenticated;
revoke delete on public.clients from authenticated;
grant select, insert, update, delete on public.client_records to authenticated;
grant select, insert, update, delete on public.client_services to authenticated;
grant select, insert, update on public.projects to authenticated;
revoke delete on public.projects from authenticated;
grant select, insert, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.project_milestones to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, delete on public.task_collaborators to authenticated;
grant select, insert, delete on public.task_dependencies to authenticated;
grant select, insert, update, delete on public.task_checklist_items to authenticated;
grant select, insert, update on public.task_comments to authenticated;
revoke delete on public.task_comments from authenticated;

grant usage on sequence public.client_code_sequence to authenticated;
grant usage on sequence public.project_code_sequence to authenticated;
grant usage on sequence public.task_code_sequence to authenticated;

grant execute on function public.can_view_client_row(public.clients) to authenticated;
grant execute on function public.can_view_project_row(public.projects) to authenticated;
grant execute on function public.can_view_task_row(public.tasks) to authenticated;
grant execute on function public.can_view_client(uuid) to authenticated;
grant execute on function public.can_update_client(uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.can_create_project(uuid) to authenticated;
grant execute on function public.can_assign_task_to(uuid, uuid) to authenticated;
grant execute on function public.get_assignable_employee_ids(uuid) to authenticated;
grant execute on function public.can_manage_task(uuid) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;
grant execute on function public.can_work_on_task(uuid) to authenticated;
grant execute on function public.get_client_timeline(uuid, integer) to authenticated;
grant execute on function public.get_task_history(uuid) to authenticated;
grant execute on function public.get_client_labels(uuid[]) to authenticated;
grant execute on function public.get_project_progress(uuid[]) to authenticated;
grant execute on function public.get_workload_rows() to authenticated;

-- ---------------------------------------------------------------------------
-- Real-time updates. Row level security still decides who receives each change.
-- ---------------------------------------------------------------------------

alter publication live_updates add table public.tasks;
alter publication live_updates add table public.task_comments;
