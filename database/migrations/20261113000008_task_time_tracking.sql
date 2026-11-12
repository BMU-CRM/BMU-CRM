-- Hours worked on a task are counted, not typed in.
--
-- * The clock runs while a task is In progress: from Start work (or Resume work) until
--   it is put on hold, submitted for review, completed or reassigned. Each stretch is
--   added to the total, so 4 hours, a hold, then 2 more hours is 6 hours.
-- * Only the person doing the work starts the clock. A manager can no longer move a task
--   from On hold to In progress: they ask the assignee to resume, which notifies them,
--   and the clock starts when the assignee presses Resume work.
-- * Reopening completed work sends it back as Changes requested, so the clock again
--   starts only when the assignee resumes.
-- Tasks already in progress start counting from now; hours typed in before are kept.

alter table public.tasks
  -- When the running stretch began; empty while the task is not In progress.
  add column work_started_at timestamptz,
  -- A manager's request to resume an on-hold task, until the assignee resumes.
  add column resume_requested_at timestamptz,
  add column resume_requested_by uuid references public.employees (id) on delete set null,
  add column resume_request_note text check (length(resume_request_note) <= 1000);

-- As before, with three changes: hours worked and the resume request cannot be typed
-- in; a manager cannot resume someone else's on-hold task; reopening goes to Changes
-- requested.
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
  v_can_manage := public.can_manage_task(old.id)
    and (old.assignee_id is distinct from v_actor or old.created_by = v_actor);
  v_can_review := (
      old.created_by = v_actor
      or old.reviewer_id = v_actor
      or public.can_manage_task(old.id)
    ) and (old.assignee_id is distinct from v_actor or v_is_self_task);
  v_can_move_deadline := v_is_assignee
    and old.status not in ('completed', 'rejected')
    and new.due_date is not null;

  if new.task_code is distinct from old.task_code
     or new.created_by is distinct from old.created_by
     or new.parent_task_id is distinct from old.parent_task_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  -- Counted from Start work to Submit for review; never typed in.
  if new.actual_hours is distinct from old.actual_hours or new.work_started_at is distinct from old.work_started_at then
    raise exception 'Hours worked are counted automatically from Start work, so they cannot be typed in.'
      using errcode = 'insufficient_privilege';
  end if;
  if current_setting('app.trusted_task_resume', true) is distinct from 'on' and (
    new.resume_requested_at is distinct from old.resume_requested_at
    or new.resume_requested_by is distinct from old.resume_requested_by
    or new.resume_request_note is distinct from old.resume_request_note
  ) then
    raise exception 'Ask to resume from the task page.' using errcode = 'insufficient_privilege';
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

  if not v_can_manage and new.due_date is distinct from old.due_date
     and new.start_date is not null and new.start_date > new.due_date then
    new.start_date := new.due_date;
  end if;

  if not (v_is_assignee or v_can_manage) and new.completion_percentage is distinct from old.completion_percentage then
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

    -- A manager pauses work, and reopens finished work for the assignee to pick up.
    -- Resuming is the assignee's: managers ask them to (request_task_resume).
    if v_can_manage and (
      (new.status = 'on_hold' and old.status not in ('completed', 'rejected'))
      or (old.status = 'completed' and new.status = 'changes_requested')
    ) then
      v_allowed := true;
    end if;

    if not v_allowed then
      if v_can_manage and old.status = 'on_hold' and new.status = 'in_progress' then
        raise exception 'Only the person doing the work can resume it. Ask them to resume instead.'
          using errcode = 'insufficient_privilege';
      end if;
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

-- The clock. Runs after the guard (triggers run in name order), for every change of
-- status however it happens, including reassignment.
create function public.track_task_time()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- New work starts with no hours; one created already in progress starts counting.
    if (select auth.uid()) is not null then
      new.actual_hours := 0;
    end if;
    new.work_started_at := case when new.status = 'in_progress' then now() end;
    new.resume_requested_at := null;
    new.resume_requested_by := null;
    new.resume_request_note := null;
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'in_progress' and old.work_started_at is not null then
    new.actual_hours := least(
      old.actual_hours + round((extract(epoch from (now() - old.work_started_at)) / 3600)::numeric, 2),
      99999.99
    );
    new.work_started_at := null;
  end if;
  if new.status = 'in_progress' then
    new.work_started_at := now();
    new.resume_requested_at := null;
    new.resume_requested_by := null;
    new.resume_request_note := null;
  end if;
  return new;
end;
$$;

create trigger tasks_track_time before insert or update of status, assignee_id on public.tasks
  for each row execute function public.track_task_time();

-- A manager asks the assignee to pick an on-hold task back up. The task stays on hold
-- until they press Resume work, which starts the clock.
create function public.request_task_resume(p_task uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_task public.tasks;
  v_name text;
begin
  select * into v_task from public.tasks where id = p_task for update;
  if v_actor is null or v_task.id is null or not public.can_manage_task(p_task) or v_task.assignee_id = v_actor then
    raise exception 'You cannot ask for this task to be resumed.' using errcode = 'insufficient_privilege';
  end if;
  if v_task.status <> 'on_hold' then
    raise exception 'Only a task on hold can be resumed.' using errcode = 'check_violation';
  end if;
  if v_task.assignee_id is null then
    raise exception 'Assign the task to someone first.' using errcode = 'check_violation';
  end if;

  perform set_config('app.trusted_task_resume', 'on', true);
  update public.tasks set resume_requested_at = now(), resume_requested_by = v_actor,
    resume_request_note = nullif(trim(p_note), '')
  where id = p_task;
  perform set_config('app.trusted_task_resume', 'off', true);

  select full_name into v_name from public.employees where id = v_actor;
  perform public.notify(v_task.assignee_id, 'task_resume_requested', coalesce(v_name, 'Your manager') || ' asked you to resume work',
    v_task.title || coalesce(': ' || nullif(trim(p_note), ''), ''), '/tasks/' || p_task, 'high');
end;
$$;

-- Work already under way starts counting now.
update public.tasks set work_started_at = now() where status = 'in_progress' and work_started_at is null;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.request_task_resume(uuid, text) to authenticated;
