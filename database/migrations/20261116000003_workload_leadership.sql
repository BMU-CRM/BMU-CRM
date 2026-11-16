-- Nobody gives the Founder or Co-Founder tasks, so their capacity is not tracked: they
-- are left out of the Workload page and of their own "My workload" card. They still see
-- everyone else's workload. A role setting, "Workload tracked", decides it (Settings,
-- Roles), so no role is named in the rules.

alter table public.roles
  add column tracks_workload boolean not null default true;

update public.roles set tracks_workload = false where name in ('Founder', 'Co-Founder');

create or replace function public.get_workload_rows()
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
  left join public.roles r on r.id = e.role_id
  left join public.departments d on d.id = e.department_id
  left join public.designations g on g.id = e.designation_id
  left join public.tasks t on t.assignee_id = e.id and (
    t.status not in ('completed', 'rejected')
    or t.completed_at > now() - interval '90 days'
  )
  where e.is_active and coalesce(r.tracks_workload, true) and (
    v_scope = 'organisation'
    or e.id = v_actor
    or (v_scope = 'department' and e.department_id = v_department)
    or public.is_in_reporting_line(e.id, v_actor)
  );
end;
$$;

create or replace function public.get_my_workload_rows()
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
language sql stable security definer set search_path = ''
as $$
  select
    e.id, e.full_name, d.name, g.title,
    t.id, t.status, t.priority, t.complexity, t.estimated_hours, t.actual_hours,
    t.completion_percentage, t.quality_rating, t.due_date, t.completed_at
  from public.employees e
  left join public.roles r on r.id = e.role_id
  left join public.departments d on d.id = e.department_id
  left join public.designations g on g.id = e.designation_id
  left join public.tasks t on t.assignee_id = e.id and (
    t.status not in ('completed', 'rejected')
    or t.completed_at > now() - interval '90 days'
  )
  where e.id = public.current_employee_id() and coalesce(r.tracks_workload, true)
$$;
