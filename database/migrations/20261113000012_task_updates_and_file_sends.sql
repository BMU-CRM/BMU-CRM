-- Two notices for the people on a task:
--
-- * When someone else edits a task (its title, description, priority, dates, links and
--   so on), the assignee is told again. Repeated edits before they read it are grouped
--   into one notification. A moved deadline keeps its own notice.
-- * The person doing the work can send the files they added to whoever assigned the task
--   (and its reviewer), for example files added after submitting it. Only files not sent
--   before, and not already handed in with Submit for review, are included. Each send is
--   recorded in the task's history.

-- As before, plus "your task was updated".
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

-- The files a person added to a task that they have not handed over yet: added after
-- they last sent files or submitted the task. Internal; not callable through the API.
create function public.unsent_task_files(p_task uuid, p_actor uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  with handed_over as (
    select max(a.created_at) as at
    from public.audit_logs a
    where a.entity_type = 'tasks' and a.entity_id = p_task::text and a.actor_employee_id = p_actor
      and (
        a.action = 'files_sent'
        or a.details -> 'changes' -> 'status' ->> 'to' in ('under_review', 'completed')
      )
  )
  select array_agg(f.name order by f.created_at)
  from public.files f, handed_over h
  where f.task_id = p_task and f.owner_id = p_actor and f.status = 'ready' and not f.is_archived
    and (h.at is null or f.created_at > h.at)
$$;

-- How many files the current person can send on a task, so the page knows whether to
-- offer the button. Zero for anyone who is not working on it.
create function public.count_unsent_task_files(p_task uuid)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task;
  if v_actor is null or v_task.id is null or not (
    v_task.assignee_id = v_actor
    or exists (select 1 from public.task_collaborators c where c.task_id = p_task and c.employee_id = v_actor)
  ) then
    return 0;
  end if;
  return coalesce(cardinality(public.unsent_task_files(p_task, v_actor)), 0);
end;
$$;

-- Sends the person's new files on a task to whoever assigned it, and its reviewer.
-- Returns how many files were sent.
create function public.send_task_files(p_task uuid, p_note text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_task public.tasks;
  v_note text := nullif(trim(p_note), '');
  v_files text[];
  v_recipients uuid[];
  v_recipient uuid;
  v_actor_name text;
  v_recipient_names text;
  v_count integer;
begin
  select * into v_task from public.tasks where id = p_task;
  if v_actor is null or v_task.id is null or not (
    v_task.assignee_id = v_actor
    or exists (select 1 from public.task_collaborators c where c.task_id = p_task and c.employee_id = v_actor)
  ) then
    raise exception 'Only the people working on this task can send its files.' using errcode = 'insufficient_privilege';
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = 'check_violation';
  end if;

  select array_agg(person) into v_recipients
  from (select v_task.created_by as person union select v_task.reviewer_id) people
  where person is not null and person <> v_actor
    and exists (select 1 from public.employees e where e.id = person and e.is_active);
  if v_recipients is null then
    raise exception 'There is nobody to send these files to.' using errcode = 'check_violation';
  end if;

  v_files := public.unsent_task_files(p_task, v_actor);
  if v_files is null then
    raise exception 'There are no new files to send. Add a file or link first.' using errcode = 'check_violation';
  end if;
  v_count := cardinality(v_files);

  select full_name into v_actor_name from public.employees where id = v_actor;
  select string_agg(full_name, ' and ' order by full_name) into v_recipient_names
  from public.employees where id = any (v_recipients);

  foreach v_recipient in array v_recipients loop
    perform public.notify(v_recipient, 'file_received',
      coalesce(v_actor_name, 'A colleague') || ' sent ' || v_count || case when v_count = 1 then ' file' else ' files' end || ' on a task',
      v_task.title || ': ' || array_to_string(v_files[1:3], ', ')
        || case when v_count > 3 then ' and ' || (v_count - 3) || ' more' else '' end
        || coalesce('. ' || v_note, ''),
      '/tasks/' || p_task);
  end loop;

  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (
    v_actor, coalesce(v_actor_name, 'System'), 'files_sent', 'tasks', p_task::text,
    jsonb_build_object(
      'label', v_task.title,
      'summary', 'Sent ' || v_count || case when v_count = 1 then ' file' else ' files' end || ' to ' || v_recipient_names
        || ': ' || array_to_string(v_files, ', ') || coalesce('. Note: ' || v_note, ''),
      'files', to_jsonb(v_files),
      'note', v_note
    )
  );

  return v_count;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.count_unsent_task_files(uuid) to authenticated;
grant execute on function public.send_task_files(uuid, text) to authenticated;
