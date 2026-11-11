-- As the owner asked:
--
-- * People can postpone or bring forward their own open tasks from the calendar. Until
--   now only whoever manages a task could move its deadline. Whoever assigned the task,
--   and its reviewer, are told when the deadline moves, and the audit log records it.
-- * Client Managers see workload for the whole organisation, like administrators.
--   Department heads keep their own department.
-- * The Employees section is for the Founder, Co-Founder, Client Managers and
--   department heads only, so the default Employee role no longer has it. Colleagues'
--   names still show across the app on tasks, chats, meetings and files.

-- ---------------------------------------------------------------------------
-- Moving deadlines
-- ---------------------------------------------------------------------------

create or replace function public.guard_task_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_assignee boolean;
  v_is_self_task boolean;
  v_can_manage boolean;
  v_can_review boolean;
  v_can_move_deadline boolean;
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
  -- The assignee may move the deadline of open work, but not remove it.
  v_can_move_deadline := v_is_assignee
    and old.status not in ('completed', 'rejected')
    and new.due_date is not null;

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
    or (new.due_date is distinct from old.due_date and not v_can_move_deadline)
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

  -- Brought forward before its start date, the task now starts on the new deadline.
  if not v_can_manage and new.due_date is distinct from old.due_date
     and new.start_date is not null and new.start_date > new.due_date then
    new.start_date := new.due_date;
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

-- As before, plus a notice when a deadline moves. Nobody is told about their own change.
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

  if new.due_date is distinct from old.due_date and new.due_date is not null
     and new.assignee_id is not distinct from old.assignee_id
     and new.status not in ('completed', 'rejected') then
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

  if new.escalated_to is distinct from old.escalated_to then
    perform public.notify(new.escalated_to, 'task_escalated', 'A task was escalated to you',
      new.title || coalesce(': ' || new.escalation_reason, ''), v_link, 'high');
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

update public.role_permissions rp
set scope = 'organisation'
from public.roles r
where r.id = rp.role_id and r.name = 'Client Manager' and rp.permission_key = 'workload.view';

delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id and r.name = 'Employee' and rp.permission_key = 'employees.view';
