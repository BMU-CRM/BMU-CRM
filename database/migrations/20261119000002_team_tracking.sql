-- Team tracking for the Founder, as the owner asked, and sub services without a plan.
--
-- A. A sub service can be set not to ask for a plan on clients ("Choose a plan for
--    clients"), as Website Design & Development, which is quoted per project. Its plan is
--    never kept on a client, and on a new quotation its rate starts empty.
-- B. Team tracking:
--    * Red flags, worked out each time from tasks, attendance and leave: work overdue by
--      more than a few days, sent back for rework many times, waiting long for review,
--      people with nothing done for some working days, and attendance that does not match
--      the hours on tasks. The limits are settings. Senders mark a flag "Looked into"
--      with a comment; a sent report keeps the open flags and comments.
--    * The Founder marks a received report Reviewed, with a reply; the sender is told.
--    * At 6:30 pm India time on working days, those who send a daily report (Client
--      Managers) are reminded if they have not sent today's, unless on leave.
--    * "See team pulse" shows a daily summary on the Overview.
-- No role is named in the rules; the roles below are only given the permissions.

-- A. Sub services without a plan ----------------------------------------------------------

alter table public.services add column asks_plan boolean not null default true;
update public.services set asks_plan = false where lower(name) = 'website design & development';

create function public.clear_unasked_client_plan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.plan is not null and new.service_id is not null
     and exists (select 1 from public.services s where s.id = new.service_id and not s.asks_plan) then
    new.plan := null;
  end if;
  return new;
end;
$$;

create trigger client_services_clear_unasked_plan before insert or update on public.client_services
  for each row execute function public.clear_unasked_client_plan();

-- Turning the setting off clears the plans clients have for it.
create function public.clear_plans_when_not_asked()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.asks_plan and not new.asks_plan then
    update public.client_services set plan = null where service_id = new.id and plan is not null;
  end if;
  return new;
end;
$$;

create trigger services_clear_plans after update of asks_plan on public.services
  for each row execute function public.clear_plans_when_not_asked();

update public.client_services cs
set plan = null
from public.services s
where s.id = cs.service_id and not s.asks_plan and cs.plan is not null;

-- B. Permissions -------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('dashboard.team_pulse', 'Tasks', 'See team pulse',
    'A daily summary of the team''s work on the Overview.', '{organisation}', 466),
  ('workload.daily_report', 'Tasks', 'Send a daily workload report',
    'Reminded at 6:30 pm on working days to send the day''s workload report, if not sent.', '{organisation}', 468),
  ('workload.flags_manage', 'Tasks', 'Set red flag limits',
    'Change when work is flagged: days overdue, times sent back, days waiting for review, idle days.', '{organisation}', 470)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, 'organisation'
from (values
  ('founder', 'dashboard.team_pulse'),
  ('client manager', 'dashboard.team_pulse'),
  ('client manager', 'workload.daily_report'),
  ('founder', 'workload.flags_manage'),
  ('human resource', 'workload.flags_manage')
) as m (role_name, permission_key)
join public.roles r on lower(r.name) = m.role_name
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Working days ------------------------------------------------------------------------------

-- A company working day: in the working pattern and not a holiday.
create function public.is_company_working_day(p_day date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.company_settings s where extract(isodow from p_day)::integer = any (s.working_days))
    and not exists (select 1 from public.holidays h where h.holiday_date = p_day)
$$;

create function public.is_on_leave(p_employee uuid, p_day date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leave_requests l
    where l.employee_id = p_employee and l.status = 'approved' and p_day between l.start_date and l.end_date
  )
$$;

-- Working days from p_start to p_end on which the person was not on leave.
create function public.employee_working_days(p_employee uuid, p_start date, p_end date)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from generate_series(p_start, p_end, interval '1 day') as day
  where p_start <= p_end
    and public.is_company_working_day(day::date)
    and not public.is_on_leave(p_employee, day::date)
$$;

-- Red flags --------------------------------------------------------------------------------

create table public.workload_flag_settings (
  id boolean primary key default true check (id),
  overdue_days integer not null default 2 check (overdue_days between 1 and 60),
  rework_times integer not null default 3 check (rework_times between 1 and 20),
  review_wait_days integer not null default 2 check (review_wait_days between 1 and 60),
  idle_working_days integer not null default 2 check (idle_working_days between 1 and 30),
  check_attendance boolean not null default true,
  -- Hours on tasks are recorded by day from this date, so attendance is compared from it.
  hours_tracked_from date not null default public.india_today(),
  updated_at timestamptz not null default now()
);
insert into public.workload_flag_settings (id) values (true);

create trigger workload_flag_settings_set_updated_at before update on public.workload_flag_settings
  for each row execute function public.set_updated_at();
create trigger workload_flag_settings_audit after insert or update or delete on public.workload_flag_settings
  for each row execute function public.audit_row_change();

alter table public.workload_flag_settings enable row level security;
create policy workload_flag_settings_select on public.workload_flag_settings for select to authenticated
  using (public.current_employee_id() is not null);
create policy workload_flag_settings_update on public.workload_flag_settings for update to authenticated
  using (public.permission_scope_for('workload.flags_manage') is not null)
  with check (public.permission_scope_for('workload.flags_manage') is not null);
grant select, update (overdue_days, rework_times, review_wait_days, idle_working_days, check_attendance)
  on public.workload_flag_settings to authenticated;
revoke all on public.workload_flag_settings from anon;

-- "Looked into", with a comment, per flag. A flag that comes back in a new form (sent
-- back again, idle again) has a new key, so it shows as open again.
create table public.workload_flag_notes (
  flag_key text primary key check (length(flag_key) between 3 and 200),
  note text not null check (length(trim(note)) between 2 and 1000),
  noted_by uuid references public.employees (id) on delete set null,
  noted_by_name text not null,
  noted_at timestamptz not null default now()
);

create trigger workload_flag_notes_audit after insert or update or delete on public.workload_flag_notes
  for each row execute function public.audit_row_change();

alter table public.workload_flag_notes enable row level security;
create policy workload_flag_notes_select on public.workload_flag_notes for select to authenticated
  using (public.permission_scope_for('workload.view') is not null);
grant select on public.workload_flag_notes to authenticated;
revoke all on public.workload_flag_notes from anon;

-- The people in reach of the signed-in person's "View workload".
create function public.workload_reach()
returns setof uuid
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
  select e.id
  from public.employees e
  left join public.roles r on r.id = e.role_id
  where e.is_active and coalesce(r.tracks_workload, true) and (
    v_scope = 'organisation'
    or e.id = v_actor
    or (v_scope = 'department' and e.department_id = v_department)
    or public.is_in_reporting_line(e.id, v_actor)
  );
end;
$$;

-- The open red flags for the people in reach, worst first within each kind.
create function public.get_workload_flags()
returns table (
  flag_key text,
  kind text,
  employee_id uuid,
  employee_name text,
  task_id uuid,
  task_title text,
  detail text,
  since date,
  note text,
  noted_by_name text,
  noted_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := public.india_today();
  v_settings public.workload_flag_settings;
  v_last_working_day date;
begin
  if public.permission_scope_for('workload.view') is null then
    return;
  end if;
  select * into v_settings from public.workload_flag_settings where id;
  select max(day::date) into v_last_working_day
  from generate_series(v_today - 7, v_today - 1, interval '1 day') as day
  where public.is_company_working_day(day::date);

  return query
  with reach as (
    select r.id from public.workload_reach() as r (id)
  ),
  open_tasks as (
    select t.* from public.tasks t
    where t.assignee_id in (select id from reach) and t.status not in ('completed', 'rejected')
  ),
  flags as (
    -- Overdue by more than the limit.
    select 'overdue:' || t.id as flag_key, 'overdue' as kind, t.assignee_id as employee_id, t.id as task_id, t.title as task_title,
      'Due ' || to_char(t.due_date, 'FMDD Mon') || ', ' || (v_today - t.due_date) || ' days overdue' as detail,
      t.due_date as since, 1 as rank_order, (v_today - t.due_date) as weight
    from open_tasks t
    where t.due_date is not null and v_today - t.due_date > v_settings.overdue_days

    union all
    -- Sent back for rework many times.
    select 'rework:' || t.id || ':' || x.times, 'rework', t.assignee_id, t.id, t.title,
      'Sent back for rework ' || x.times || ' times', null::date, 2, x.times
    from open_tasks t
    cross join lateral (
      select count(*)::integer as times from public.audit_logs l
      where l.entity_type = 'tasks' and l.entity_id = t.id::text and l.action = 'updated'
        and l.details -> 'changes' -> 'status' ->> 'to' = 'changes_requested'
    ) as x
    where x.times >= v_settings.rework_times

    union all
    -- Waiting long for review: for the reviewer to act.
    select 'review:' || t.id || ':' || t.submission_count, 'review', coalesce(t.reviewer_id, t.created_by), t.id, t.title,
      'Waiting for review for ' || (v_today - (coalesce(t.submitted_at, t.updated_at) at time zone 'Asia/Kolkata')::date) || ' days',
      (coalesce(t.submitted_at, t.updated_at) at time zone 'Asia/Kolkata')::date, 3,
      v_today - (coalesce(t.submitted_at, t.updated_at) at time zone 'Asia/Kolkata')::date
    from open_tasks t
    where t.status = 'under_review'
      and coalesce(t.submitted_at, t.updated_at) < now() - make_interval(days => v_settings.review_wait_days)

    union all
    -- Nothing done on their tasks for some working days, leave not counted.
    select 'idle:' || p.id || ':' || p.last_active, 'idle', p.id, null::uuid, null::text,
      'No task activity for ' || p.idle_days || ' working days', p.last_active, 4, p.idle_days
    from (
      select e.id, a.last_active,
        public.employee_working_days(e.id, a.last_active + 1, v_today - 1) as idle_days
      from reach e
      cross join lateral (
        select greatest(
          (select max(l.created_at) from public.audit_logs l
            where l.actor_employee_id = e.id and l.entity_type in ('tasks', 'task_comments', 'task_checklist_items', 'files')),
          (select max(s.ended_at) from public.task_work_sessions s where s.employee_id = e.id),
          (select min(t.created_at) from open_tasks t where t.assignee_id = e.id)
        ) as last_at
      ) as m
      cross join lateral (select (m.last_at at time zone 'Asia/Kolkata')::date as last_active) as a
      where exists (
        select 1 from open_tasks t
        where t.assignee_id = e.id and t.status in ('assigned', 'accepted', 'in_progress', 'changes_requested')
      )
        and m.last_at is not null
    ) as p
    where p.idle_days >= v_settings.idle_working_days

    union all
    -- Attendance that does not match the hours on tasks, on the last working day.
    select 'attendance:' || e.id || ':' || v_last_working_day, 'attendance', e.id, null::uuid, null::text,
      case when h.hours > 0
        then 'Logged ' || round(h.hours, 1) || ' h on tasks on ' || to_char(v_last_working_day, 'FMDD Mon') || ' without checking in'
        else 'Checked in on ' || to_char(v_last_working_day, 'FMDD Mon') || ' but logged no hours on tasks'
      end,
      v_last_working_day, 5, 0
    from reach e
    cross join lateral (
      select coalesce(sum(extract(epoch from (
        least(s.ended_at, (v_last_working_day + 1)::timestamp at time zone 'Asia/Kolkata')
        - greatest(s.started_at, v_last_working_day::timestamp at time zone 'Asia/Kolkata')
      )) / 3600), 0) as hours
      from public.task_work_sessions s
      where s.employee_id = e.id
        and s.started_at < (v_last_working_day + 1)::timestamp at time zone 'Asia/Kolkata'
        and s.ended_at > v_last_working_day::timestamp at time zone 'Asia/Kolkata'
    ) as h
    cross join lateral (
      select exists (
        select 1 from public.attendance_records a
        where a.employee_id = e.id and a.work_date = v_last_working_day and a.check_in_at is not null
      ) as present
    ) as att
    where v_settings.check_attendance
      and v_last_working_day is not null
      and v_last_working_day >= v_settings.hours_tracked_from
      and not public.is_on_leave(e.id, v_last_working_day)
      and (
        (att.present and h.hours = 0 and exists (select 1 from open_tasks t where t.assignee_id = e.id))
        or (not att.present and h.hours > 0)
      )
  )
  select f.flag_key, f.kind, f.employee_id, emp.full_name, f.task_id, f.task_title, f.detail, f.since,
    n.note, n.noted_by_name, n.noted_at
  from flags f
  left join public.employees emp on emp.id = f.employee_id
  left join public.workload_flag_notes n on n.flag_key = f.flag_key
  order by f.rank_order, f.weight desc, emp.full_name;
end;
$$;

-- Marks a flag "Looked into" with a comment; an empty comment opens it again.
create function public.set_workload_flag_note(p_flag_key text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
begin
  if v_actor is null or public.permission_scope_for('workload.report_send') is null
     or public.permission_scope_for('workload.view') is null then
    raise exception 'You cannot comment on red flags.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.get_workload_flags() f where f.flag_key = p_flag_key) then
    raise exception 'This flag is no longer open.' using errcode = 'check_violation';
  end if;
  if v_note is null then
    delete from public.workload_flag_notes where flag_key = p_flag_key;
    return;
  end if;
  if length(v_note) > 1000 then
    raise exception 'Keep the comment to 1000 characters.' using errcode = 'check_violation';
  end if;
  select full_name into v_name from public.employees where id = v_actor;
  insert into public.workload_flag_notes (flag_key, note, noted_by, noted_by_name)
  values (p_flag_key, v_note, v_actor, coalesce(v_name, 'Someone'))
  on conflict (flag_key) do update
    set note = excluded.note, noted_by = excluded.noted_by, noted_by_name = excluded.noted_by_name, noted_at = now();
end;
$$;

-- Sent reports: open flags, and the Founder's review ------------------------------------------

alter table public.workload_reports
  add column flags jsonb not null default '[]'::jsonb,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.employees (id) on delete set null,
  add column reviewed_by_name text,
  add column reply text check (length(reply) <= 1000);

-- As before, and the open red flags with their comments are kept with the figures.
create or replace function public.send_workload_report(p_period text, p_date date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_from date;
  v_to date;
  v_figures jsonb;
  v_flags jsonb;
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
  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_flags
  from public.get_workload_flags() f;
  v_title := case
    when p_period = 'week' then 'Workload report, week of ' || to_char(v_from, 'FMDD Mon YYYY')
    else 'Workload report, ' || to_char(v_from, 'FMDD Mon YYYY')
  end;
  select full_name into v_name from public.employees where id = v_actor;

  insert into public.workload_reports (period, period_from, period_to, title, note, figures, flags, sent_by, sent_by_name)
  values (p_period, v_from, v_to, v_title, v_note, v_figures, v_flags, v_actor, coalesce(v_name, 'Someone'))
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

-- The Founder marks a report Reviewed, with an optional reply; the sender is told. It can
-- be done again to change the reply.
create function public.review_workload_report(p_report uuid, p_reply text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_reply text := nullif(trim(coalesce(p_reply, '')), '');
  v_name text;
  v_report public.workload_reports;
begin
  if v_actor is null or public.permission_scope_for('workload.report_receive') is null then
    raise exception 'You cannot review workload reports.' using errcode = 'insufficient_privilege';
  end if;
  if length(v_reply) > 1000 then
    raise exception 'Keep the reply to 1000 characters.' using errcode = 'check_violation';
  end if;
  select * into v_report from public.workload_reports where id = p_report for update;
  if v_report.id is null then
    raise exception 'This report no longer exists.' using errcode = 'check_violation';
  end if;
  select full_name into v_name from public.employees where id = v_actor;
  update public.workload_reports
  set reviewed_at = now(), reviewed_by = v_actor, reviewed_by_name = coalesce(v_name, 'Someone'), reply = v_reply
  where id = p_report;
  perform public.notify(v_report.sent_by, 'workload_report_reviewed',
    coalesce(v_name, 'Someone') || ' reviewed your workload report',
    v_report.title || coalesce(': ' || v_reply, ''), '/workload/reports/' || p_report);
end;
$$;

-- Daily reports ------------------------------------------------------------------------------

-- Those who send a daily report and have not sent one for p_date: on working days, not
-- on leave. For those who receive reports.
create function public.get_missing_daily_reports(p_date date)
returns table (employee_id uuid, full_name text)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.full_name
  from public.employees e
  where public.permission_scope_for('workload.report_receive') is not null
    and e.is_active
    and public.is_company_working_day(p_date)
    and public.employee_has_permission(e.id, 'workload.daily_report')
    and not public.is_on_leave(e.id, p_date)
    and not exists (
      select 1 from public.workload_reports r
      where r.sent_by = e.id and r.period = 'day' and r.period_from = p_date
    )
  order by e.full_name
$$;

-- At 6:30 pm India time: reminds each of them who has not sent today's report.
create function public.remind_daily_workload_reports()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := public.india_today();
  v_person uuid;
begin
  if not public.is_company_working_day(v_today) then
    return;
  end if;
  for v_person in
    select e.id from public.employees e
    where e.is_active
      and public.employee_has_permission(e.id, 'workload.daily_report')
      and not public.is_on_leave(e.id, v_today)
      and not exists (
        select 1 from public.workload_reports r
        where r.sent_by = e.id and r.period = 'day' and r.period_from = v_today
      )
  loop
    perform public.notify(v_person, 'workload_report_reminder', 'Send today''s workload report',
      'Today''s report to the Founder is not sent yet.', '/workload/report?period=day', 'normal', null,
      'workload-report-reminder:' || v_today);
  end loop;
end;
$$;

-- 13:00 UTC is 6:30 pm India time.
select cron.schedule('remind-daily-workload-reports', '0 13 * * *', $$select public.remind_daily_workload_reports()$$);

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.remind_daily_workload_reports() from authenticated;
revoke execute on function public.clear_unasked_client_plan() from authenticated;
revoke execute on function public.clear_plans_when_not_asked() from authenticated;
grant execute on function public.get_workload_flags() to authenticated;
grant execute on function public.set_workload_flag_note(text, text) to authenticated;
grant execute on function public.review_workload_report(uuid, text) to authenticated;
grant execute on function public.get_missing_daily_reports(date) to authenticated;
-- Used only inside the functions above, so whose leave falls when stays private.
revoke execute on function public.workload_reach() from authenticated;
revoke execute on function public.is_company_working_day(date) from authenticated;
revoke execute on function public.is_on_leave(uuid, date) from authenticated;
revoke execute on function public.employee_working_days(uuid, date, date) from authenticated;
