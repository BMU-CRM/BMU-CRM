-- Everyone sees their own workload on their dashboard. get_workload_rows needs
-- workload.view, which only managers have, so this returns the signed-in person's own
-- rows: one per open or recently finished task, or one empty row if they have none.

create function public.get_my_workload_rows()
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
  left join public.departments d on d.id = e.department_id
  left join public.designations g on g.id = e.designation_id
  left join public.tasks t on t.assignee_id = e.id and (
    t.status not in ('completed', 'rejected')
    or t.completed_at > now() - interval '90 days'
  )
  where e.id = public.current_employee_id()
$$;

revoke execute on function public.get_my_workload_rows() from public, anon;
grant execute on function public.get_my_workload_rows() to authenticated;
