-- Workload reports, as the owner asked:
-- * HR and Client Managers see the workload of every employee.
-- * Anyone who sees workload can look at a day or a week (Monday to Sunday): for each
--   person, what happened in it (tasks assigned, started, submitted, sent back,
--   approved, completed late, hours worked) and where their open work stood at its end.
-- * Client Managers and HR send a report to the Founder ("Send workload reports"). A
--   copy of the figures is kept as sent, and whoever can "Receive workload reports" is
--   notified and finds it on the Received reports page.
-- * Each stretch of work on a task is now recorded, so hours split exactly by day.
--   Before this, only a task's running total was kept: those hours count on the day the
--   stretch ended, from the audit log.
-- No role is named in the rules; the roles below are only given the permissions.

-- Permissions -------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('workload.report_send', 'Tasks', 'Send workload reports',
    'Send the day or week workload report to those who receive them.', '{organisation}', 462),
  ('workload.report_receive', 'Tasks', 'Receive workload reports',
    'Get the workload reports that are sent, on the Received reports page.', '{organisation}', 464)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, 'organisation'
from (values
  ('client manager', 'workload.view'),
  ('client manager', 'workload.report_send'),
  ('human resource', 'workload.view'),
  ('human resource', 'workload.report_send'),
  ('founder', 'workload.report_receive')
) as m (role_name, permission_key)
join public.roles r on lower(r.name) = m.role_name
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Stretches of work -------------------------------------------------------------------

create table public.task_work_sessions (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  constraint task_work_sessions_order check (ended_at >= started_at)
);
create index task_work_sessions_employee_idx on public.task_work_sessions (employee_id, ended_at);
create index task_work_sessions_task_idx on public.task_work_sessions (task_id, ended_at);

-- Read only through the report functions.
alter table public.task_work_sessions enable row level security;
revoke all on public.task_work_sessions from anon, authenticated;

-- As before, and each stretch that ends is recorded for the person who did it.
create or replace function public.track_task_time()
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
    if old.assignee_id is not null then
      insert into public.task_work_sessions (task_id, employee_id, started_at, ended_at)
      values (old.id, old.assignee_id, old.work_started_at, greatest(now(), old.work_started_at));
    end if;
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

-- A day or a week -----------------------------------------------------------------------

-- For each person in reach of the signed-in person's "View workload", from p_from to
-- p_to (Indian dates, both included). Tasks count for the person they are assigned to.
create function public.get_workload_activity(p_from date, p_to date)
returns table (
  employee_id uuid,
  full_name text,
  department_name text,
  designation_title text,
  assigned integer,
  started integer,
  submitted integer,
  sent_back integer,
  approved integer,
  completed_late integer,
  hours_worked numeric,
  yet_to_start integer,
  in_progress integer,
  waiting_review integer,
  overdue integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('workload.view');
  v_department uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := now();
  -- A task still open after this date is overdue at the end of the period.
  v_overdue_before date;
begin
  if v_actor is null or v_scope is null then
    return;
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    raise exception 'Choose a day or a week.' using errcode = 'check_violation';
  end if;

  v_start := p_from::timestamp at time zone 'Asia/Kolkata';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';
  v_overdue_before := least(p_to + 1, public.india_today());
  select e.department_id into v_department from public.employees e where e.id = v_actor;

  return query
  with people as (
    select e.id, e.full_name, d.name as department_name, g.title as designation_title
    from public.employees e
    left join public.roles r on r.id = e.role_id
    left join public.departments d on d.id = e.department_id
    left join public.designations g on g.id = e.designation_id
    where e.is_active and coalesce(r.tracks_workload, true) and (
      v_scope = 'organisation'
      or e.id = v_actor
      or (v_scope = 'department' and e.department_id = v_department)
      or public.is_in_reporting_line(e.id, v_actor)
    )
  ),
  -- Status changes in the period, for the task's assignee.
  changes as (
    select t.assignee_id as person, t.due_date, l.created_at,
      l.details -> 'changes' -> 'status' ->> 'from' as from_status,
      l.details -> 'changes' -> 'status' ->> 'to' as to_status
    from public.audit_logs l
    join public.tasks t on t.id::text = l.entity_id
    where l.entity_type = 'tasks' and l.action = 'updated'
      and l.created_at >= v_start and l.created_at < v_end
      and l.details -> 'changes' ? 'status'
  ),
  -- Tasks given to someone in the period: created for them, or handed to them.
  assignments as (
    select coalesce(l.details -> 'created' ->> 'assignee_id', l.details -> 'changes' -> 'assignee_id' ->> 'to')::uuid as person
    from public.audit_logs l
    where l.entity_type = 'tasks' and l.created_at >= v_start and l.created_at < v_end
      and (
        (l.action = 'created' and l.details -> 'created' ->> 'assignee_id' is not null)
        or (l.action = 'updated' and l.details -> 'changes' -> 'assignee_id' ->> 'to' is not null)
      )
  ),
  -- Recorded stretches, the part inside the period.
  session_hours as (
    select s.employee_id as person,
      sum(extract(epoch from (least(s.ended_at, v_end) - greatest(s.started_at, v_start))) / 3600) as hours
    from public.task_work_sessions s
    where s.started_at < v_end and s.ended_at > v_start
    group by s.employee_id
  ),
  -- Work running now, the part inside the period.
  running_hours as (
    select t.assignee_id as person,
      sum(extract(epoch from (least(v_now, v_end) - greatest(t.work_started_at, v_start))) / 3600) as hours
    from public.tasks t
    where t.status = 'in_progress' and t.work_started_at is not null
      and t.work_started_at < v_end and v_now > v_start
    group by t.assignee_id
  ),
  -- Hours added before stretches were recorded, on the day the stretch ended.
  logged_hours as (
    select t.assignee_id as person,
      sum(
        coalesce((l.details -> 'changes' -> 'actual_hours' ->> 'to')::numeric, 0)
        - coalesce((l.details -> 'changes' -> 'actual_hours' ->> 'from')::numeric, 0)
      ) as hours
    from public.audit_logs l
    join public.tasks t on t.id::text = l.entity_id
    where l.entity_type = 'tasks' and l.action = 'updated'
      and l.created_at >= v_start and l.created_at < v_end
      and l.details -> 'changes' ? 'actual_hours'
      and not exists (
        select 1 from public.task_work_sessions s where s.task_id = t.id and s.ended_at = l.created_at
      )
    group by t.assignee_id
  ),
  -- Each task's status at the end of the period: now, or from its history.
  states as (
    select t.assignee_id as person, t.due_date,
      case when v_end > v_now then t.status::text else coalesce(
        (select l.details -> 'changes' -> 'status' ->> 'to'
          from public.audit_logs l
          where l.entity_type = 'tasks' and l.entity_id = t.id::text and l.action = 'updated'
            and l.created_at < v_end and l.details -> 'changes' ? 'status'
          order by l.created_at desc, l.id desc limit 1),
        (select l.details -> 'created' ->> 'status'
          from public.audit_logs l
          where l.entity_type = 'tasks' and l.entity_id = t.id::text and l.action = 'created'
          limit 1),
        t.status::text
      ) end as status_then
    from public.tasks t
    where t.created_at < v_end and t.assignee_id in (select id from people)
  )
  select
    p.id, p.full_name, p.department_name, p.designation_title,
    (select count(*)::integer from assignments a where a.person = p.id),
    (select count(*)::integer from changes c where c.person = p.id and c.to_status = 'in_progress'
      and c.from_status in ('not_started', 'assigned', 'accepted')),
    (select count(*)::integer from changes c where c.person = p.id and c.to_status = 'under_review'),
    (select count(*)::integer from changes c where c.person = p.id and c.to_status = 'changes_requested'),
    (select count(*)::integer from changes c where c.person = p.id and c.to_status = 'completed'),
    (select count(*)::integer from changes c where c.person = p.id and c.to_status = 'completed'
      and c.due_date is not null and c.due_date < (c.created_at at time zone 'Asia/Kolkata')::date),
    round(
      coalesce((select h.hours from session_hours h where h.person = p.id), 0)
      + coalesce((select h.hours from running_hours h where h.person = p.id), 0)
      + coalesce((select h.hours from logged_hours h where h.person = p.id), 0),
      2
    ),
    (select count(*)::integer from states s where s.person = p.id and s.status_then in ('not_started', 'assigned', 'accepted')),
    (select count(*)::integer from states s where s.person = p.id and s.status_then in ('in_progress', 'changes_requested', 'on_hold')),
    (select count(*)::integer from states s where s.person = p.id and s.status_then = 'under_review'),
    (select count(*)::integer from states s where s.person = p.id
      and s.status_then in ('not_started', 'assigned', 'accepted', 'in_progress', 'changes_requested', 'on_hold', 'under_review')
      and s.due_date is not null and s.due_date < v_overdue_before)
  from people p
  order by p.full_name;
end;
$$;

-- Sent reports ---------------------------------------------------------------------------

create table public.workload_reports (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period in ('day', 'week')),
  period_from date not null,
  period_to date not null,
  title text not null,
  note text check (length(note) <= 1000),
  -- The figures as they were when sent, one entry per person.
  figures jsonb not null default '[]'::jsonb,
  sent_by uuid references public.employees (id) on delete set null,
  sent_by_name text not null,
  created_at timestamptz not null default now(),
  constraint workload_reports_period check (period_to >= period_from)
);
create index workload_reports_created_idx on public.workload_reports (created_at desc);

create trigger workload_reports_audit after insert or update or delete on public.workload_reports
  for each row execute function public.audit_row_change();

alter table public.workload_reports enable row level security;
-- Sent only through send_workload_report; seen by the sender and the receivers.
create policy workload_reports_select on public.workload_reports for select to authenticated
  using (sent_by = public.current_employee_id() or public.permission_scope_for('workload.report_receive') is not null);
grant select on public.workload_reports to authenticated;
revoke all on public.workload_reports from anon;

-- Sends the day or the week holding p_date. A week runs Monday to Sunday.
create function public.send_workload_report(p_period text, p_date date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_from date;
  v_to date;
  v_figures jsonb;
  v_title text;
  v_name text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_id uuid;
  v_recipient uuid;
begin
  if v_actor is null or public.permission_scope_for('workload.report_send') is null
     or public.permission_scope_for('workload.view') is null then
    raise exception 'You cannot send workload reports.' using errcode = 'insufficient_privilege';
  end if;
  if p_period is null or p_period not in ('day', 'week') or p_date is null then
    raise exception 'Choose a day or a week.' using errcode = 'check_violation';
  end if;
  if p_date > public.india_today() then
    raise exception 'Choose a day that has already started.' using errcode = 'check_violation';
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the note to 1000 characters.' using errcode = 'check_violation';
  end if;

  v_from := case when p_period = 'week' then p_date - (extract(isodow from p_date)::integer - 1) else p_date end;
  v_to := case when p_period = 'week' then v_from + 6 else p_date end;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.full_name), '[]'::jsonb) into v_figures
  from public.get_workload_activity(v_from, v_to) a;
  v_title := case
    when p_period = 'week' then 'Workload report, week of ' || to_char(v_from, 'FMDD Mon YYYY')
    else 'Workload report, ' || to_char(v_from, 'FMDD Mon YYYY')
  end;
  select full_name into v_name from public.employees where id = v_actor;

  insert into public.workload_reports (period, period_from, period_to, title, note, figures, sent_by, sent_by_name)
  values (p_period, v_from, v_to, v_title, v_note, v_figures, v_actor, coalesce(v_name, 'Someone'))
  returning id into v_id;

  for v_recipient in
    select e.id from public.employees e
    where e.is_active and e.id <> v_actor and public.employee_has_permission(e.id, 'workload.report_receive')
  loop
    perform public.notify(v_recipient, 'workload_report_received',
      coalesce(v_name, 'Someone') || ' sent a workload report',
      v_title || coalesce(': ' || v_note, ''), '/workload/reports/' || v_id);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.get_workload_activity(date, date) from public, anon;
revoke execute on function public.send_workload_report(text, date, text) from public, anon;
grant execute on function public.get_workload_activity(date, date) to authenticated;
grant execute on function public.send_workload_report(text, date, text) to authenticated;
