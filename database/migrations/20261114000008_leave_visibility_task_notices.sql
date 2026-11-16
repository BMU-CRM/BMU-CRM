-- Two changes the owner asked for:
--
-- * Leave on the calendar: a colleague's approved leave shows only to the people who
--   manage them (anyone above them in the reporting line), the head of their
--   department, whoever approves their leave and HR. Colleagues in the same department
--   no longer see each other's leave. Everyone still sees their own.
-- * A moved task deadline is still told to whoever assigned the task and its reviewer,
--   but not when someone moves a task they gave themselves.

create or replace function public.get_team_leave(p_from date, p_to date)
returns table (
  request_id uuid, employee_id uuid, full_name text, department_name text,
  leave_type text, start_date date, end_date date, is_half_day boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null then
    return;
  end if;

  return query
  select r.id, e.id, e.full_name, d.name, t.name, r.start_date, r.end_date, r.is_half_day
  from public.leave_requests r
  join public.employees e on e.id = r.employee_id
  join public.leave_types t on t.id = r.leave_type_id
  left join public.departments d on d.id = e.department_id
  where r.status = 'approved'
    and r.start_date <= p_to and r.end_date >= p_from
    and (
      e.id = v_actor
      or public.is_in_reporting_line(e.id, v_actor)
      or d.head_employee_id = v_actor
      or public.can_access_employee('leave.approve', e.id)
      or public.permission_scope_for('hr.manage') = 'organisation'
    )
  order by r.start_date;
end;
$$;

create or replace function public.notify_task_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_link text := '/tasks/' || new.id;
  v_priority public.notification_priority :=
    case when new.priority in ('high', 'urgent') then 'high' else 'normal' end::public.notification_priority;
  v_when text;
  v_recipient uuid;
  v_changed text[] := array[]::text[];
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

  -- A moved deadline is told to the assignee, whoever assigned it and the reviewer, but
  -- never for a task someone gave themselves and moved themselves.
  if new.due_date is distinct from old.due_date and new.due_date is not null
     and new.assignee_id is not distinct from old.assignee_id
     and new.status not in ('completed', 'rejected')
     and not (new.created_by = new.assignee_id and new.assignee_id = public.current_employee_id()) then
    v_when := case
      when old.due_date is null then 'now due ' || to_char(new.due_date, 'DD Mon YYYY')
      when new.due_date > old.due_date then 'postponed to ' || to_char(new.due_date, 'DD Mon YYYY')
      else 'brought forward to ' || to_char(new.due_date, 'DD Mon YYYY')
    end;
    for v_recipient in
      select distinct person from (
        select new.assignee_id as person
        union select new.created_by
        union select new.reviewer_id
      ) people
      where person is not null
    loop
      perform public.notify(v_recipient, 'task_rescheduled',
        case when v_recipient = new.assignee_id then 'The deadline of your task changed' else 'A task deadline changed' end,
        new.title || ': ' || v_when, v_link, v_priority);
    end loop;
  end if;

  -- The task was edited by someone else. The person who made the change is never told
  -- (notify skips them), and a new assignee already got "assigned to you".
  if new.assignee_id is not null
     and new.assignee_id is not distinct from old.assignee_id
     and new.status not in ('completed', 'rejected') then
    if new.title is distinct from old.title then v_changed := array_append(v_changed, 'title'); end if;
    if new.description is distinct from old.description then v_changed := array_append(v_changed, 'description'); end if;
    if new.priority is distinct from old.priority then v_changed := array_append(v_changed, 'priority'); end if;
    if new.complexity is distinct from old.complexity then v_changed := array_append(v_changed, 'complexity'); end if;
    if new.start_date is distinct from old.start_date then v_changed := array_append(v_changed, 'start date'); end if;
    if new.due_time is distinct from old.due_time then v_changed := array_append(v_changed, 'due time'); end if;
    if new.estimated_hours is distinct from old.estimated_hours then v_changed := array_append(v_changed, 'estimated hours'); end if;
    if new.reference_links is distinct from old.reference_links then v_changed := array_append(v_changed, 'links'); end if;
    if new.reviewer_id is distinct from old.reviewer_id then v_changed := array_append(v_changed, 'reviewer'); end if;
    if new.project_id is distinct from old.project_id then v_changed := array_append(v_changed, 'project'); end if;
    if new.client_id is distinct from old.client_id then v_changed := array_append(v_changed, 'client'); end if;
    if new.recurrence is distinct from old.recurrence then v_changed := array_append(v_changed, 'repeat'); end if;

    if cardinality(v_changed) > 0 then
      perform public.notify(new.assignee_id, 'task_updated', 'Your task was updated',
        new.title || ': changed ' || array_to_string(v_changed, ', '), v_link, v_priority,
        'task-updated:' || new.id);
    end if;
  end if;

  if new.escalated_to is distinct from old.escalated_to then
    perform public.notify(new.escalated_to, 'task_escalated', 'A task was escalated to you',
      new.title || coalesce(': ' || new.escalation_reason, ''), v_link, 'high');
  end if;

  return null;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_team_leave(date, date) to authenticated;
