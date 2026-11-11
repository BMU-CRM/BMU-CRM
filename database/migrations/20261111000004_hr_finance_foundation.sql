-- Stage 1 of the HR and Finance build, as the owner asked:
--
-- * Two dashboards: HR (run by the Human Resource role) and Finance (run by the Finance
--   Head role). Founder gets every new permission, as the roadmap requires.
-- * Leave is approved by HR only. Reporting managers and department heads no longer
--   approve leave. The Founder and Co-Founder keep their organisation-wide access.
-- * One person can hold a second role and switch between them, so someone who is both
--   Human Resource and Finance Head uses one login. Her access always follows the role
--   she is acting in, and every switch is recorded in the audit log.

-- A second role per person (created first, because the functions below use it).
create table public.employee_extra_roles (
  employee_id uuid not null references public.employees (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, role_id)
);

-- The role the person is acting in. Empty means their main role. It is checked against
-- the person's roles wherever it is read, rather than being a second link from employees
-- to roles, so "the employee's role" stays one unambiguous link for every query.
alter table public.employees add column acting_role_id uuid;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('hr.dashboard', 'HR', 'Open the HR dashboard', 'See company-wide HR figures: headcount, attendance, leave and work anniversaries.', '{organisation}', 1100),
  ('finance.dashboard', 'Finance', 'Open the finance dashboard', 'See income, money owed and collections at a glance.', '{organisation}', 1050);

-- The HR role. The live company already has one named "Human Resource"; a new
-- installation gets it here.
insert into public.roles (name, description)
select 'Human Resource', 'Runs HR: people, attendance, leave and HR settings.'
where not exists (select 1 from public.roles where lower(name) = 'human resource');

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, 'organisation'
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.key in ('hr.dashboard', 'finance.dashboard')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR: its dashboard and the HR work that already exists, across the organisation.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where lower(r.name) = 'human resource'
  and p.key in (
    'hr.dashboard', 'hr.manage', 'employees.view', 'employees.create', 'employees.update', 'employees.deactivate',
    'leave.approve', 'attendance.view', 'attendance.manage'
  )
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- And what every employee has, if the role lacks it.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[1]
from public.roles r
cross join public.permissions p
where lower(r.name) = 'human resource'
  and p.key in (
    'dashboard.view', 'leave.request', 'meetings.create', 'tickets.create', 'messages.use', 'files.upload',
    'tasks.view', 'tasks.create', 'projects.view'
  )
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'finance.dashboard', 'organisation'
from public.roles r
where r.name = 'Finance Head'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Leave is approved by HR only, as the owner asked.
delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id
  and r.name in ('Client Manager', 'Branch Manager', 'Finance Head', 'Design & Development Head', 'Digital Marketing Head')
  and rp.permission_key = 'leave.approve';

-- ---------------------------------------------------------------------------
-- Leave goes to HR, not the reporting manager
-- ---------------------------------------------------------------------------

-- Everyone whose current role holds a permission at the given scope or wider.
create function public.employees_with_permission(p_permission text, p_scope public.permission_scope)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id
  from public.employees e
  join public.role_permissions rp
    on rp.role_id = coalesce(
      case when e.acting_role_id is not null and exists (
        select 1 from public.employee_extra_roles x where x.employee_id = e.id and x.role_id = e.acting_role_id
      ) then e.acting_role_id end,
      e.role_id
    )
  join public.roles r on r.id = rp.role_id and r.is_active
  where e.is_active and rp.permission_key = p_permission and rp.scope >= p_scope
$$;

-- Only people whose leave approval reaches the employee decide. Nobody decides their own.
create or replace function public.can_decide_leave_row(v_request public.leave_requests)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or v_request.employee_id = v_actor then
    return false;
  end if;
  return public.can_access_employee('leave.approve', v_request.employee_id);
end;
$$;

-- As before, but new requests and cancellations go to the HR people, not the manager.
create or replace function public.notify_leave_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_summary text;
  v_hr uuid;
begin
  select e.full_name || ': ' || t.name || ', ' || to_char(new.start_date, 'DD Mon')
    || case when new.end_date > new.start_date then ' to ' || to_char(new.end_date, 'DD Mon') else '' end
    into v_summary
  from public.employees e, public.leave_types t
  where e.id = new.employee_id and t.id = new.leave_type_id;

  if tg_op = 'INSERT' then
    for v_hr in select id from public.employees_with_permission('leave.approve', 'organisation') as hr (id) loop
      perform public.notify(v_hr, 'leave_requested', 'A leave request needs your approval', v_summary, '/approvals');
    end loop;
    return null;
  end if;

  if new.status in ('approved', 'rejected') then
    perform public.notify(new.employee_id, 'leave_decided',
      'Your leave was ' || new.status::text, v_summary || coalesce(' (' || new.decision_note || ')', ''), '/leave',
      case when new.status = 'rejected' then 'high' else 'normal' end::public.notification_priority);
  elsif new.status = 'cancelled' and old.status = 'approved' then
    for v_hr in select id from public.employees_with_permission('leave.approve', 'organisation') as hr (id) loop
      perform public.notify(v_hr, 'leave_decided', 'Approved leave was cancelled', v_summary, '/leave');
    end loop;
    perform public.notify(new.employee_id, 'leave_decided', 'Your approved leave was cancelled', v_summary, '/leave');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- A second role, and switching between them
-- ---------------------------------------------------------------------------

-- The role whose permissions apply to the signed-in person right now.
create function public.current_role_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select case
    when e.acting_role_id is not null and exists (
      select 1 from public.employee_extra_roles x where x.employee_id = e.id and x.role_id = e.acting_role_id
    ) then e.acting_role_id
    else e.role_id
  end
  from public.employees e
  where e.id = public.current_employee_id()
$$;

create or replace function public.permission_scope_for(p_permission text)
returns public.permission_scope
language sql stable security definer set search_path = ''
as $$
  select rp.scope
  from public.roles r
  join public.role_permissions rp on rp.role_id = r.id
  where r.id = public.current_role_id() and r.is_active and rp.permission_key = p_permission
$$;

create or replace function public.get_my_permissions()
returns table (permission_key text, scope public.permission_scope)
language sql stable security definer set search_path = ''
as $$
  select rp.permission_key, rp.scope
  from public.roles r
  join public.role_permissions rp on rp.role_id = r.id
  where r.id = public.current_role_id() and r.is_active
$$;

-- Whether someone could do something in any of their roles, for choosing reviewers.
create or replace function public.employee_has_permission(p_employee uuid, p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.role_permissions rp on rp.role_id = e.role_id
      or rp.role_id in (select x.role_id from public.employee_extra_roles x where x.employee_id = e.id)
    where e.id = p_employee and e.is_active and rp.permission_key = p_key
  )
$$;

-- The roles the signed-in person can switch between.
create function public.get_my_roles()
returns table (role_id uuid, name text, is_main boolean, is_current boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.name, r.id = e.role_id, r.id = public.current_role_id()
  from public.employees e
  join public.roles r on r.id = e.role_id
    or r.id in (select x.role_id from public.employee_extra_roles x where x.employee_id = e.id)
  where e.id = public.current_employee_id() and r.is_active
  order by r.id <> e.role_id, r.name
$$;

create function public.switch_my_role(p_role uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_main uuid;
begin
  select role_id into v_main from public.employees where id = v_actor;
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if p_role is not null and p_role <> v_main and not exists (
    select 1 from public.employee_extra_roles where employee_id = v_actor and role_id = p_role
  ) then
    raise exception 'You do not have that role.' using errcode = 'insufficient_privilege';
  end if;

  update public.employees
  set acting_role_id = case when p_role = v_main then null else p_role end
  where id = v_actor;
end;
$$;

-- Additional roles are given by whoever may assign roles to that person.
create function public.set_employee_extra_roles(p_employee uuid, p_roles uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_main uuid;
  v_role uuid;
begin
  if not public.can_access_employee('employees.assign_role', p_employee) then
    raise exception 'You do not have permission to assign roles to this person.' using errcode = 'insufficient_privilege';
  end if;
  select role_id into v_main from public.employees where id = p_employee;
  foreach v_role in array coalesce(p_roles, '{}') loop
    if v_role = v_main then
      continue;
    end if;
    if not public.role_is_assignable(v_role) then
      raise exception 'You do not have permission to assign this role.' using errcode = 'insufficient_privilege';
    end if;
  end loop;

  delete from public.employee_extra_roles where employee_id = p_employee and not (role_id = any (coalesce(p_roles, '{}')));
  insert into public.employee_extra_roles (employee_id, role_id)
  select p_employee, r from unnest(coalesce(p_roles, '{}')) as r where r <> v_main
  on conflict do nothing;

  -- Someone acting in a role they no longer have goes back to their main role.
  update public.employees set acting_role_id = null
  where id = p_employee and acting_role_id is not null
    and not exists (select 1 from public.employee_extra_roles where employee_id = p_employee and role_id = acting_role_id);
end;
$$;

alter table public.employee_extra_roles enable row level security;
create policy employee_extra_roles_select on public.employee_extra_roles for select to authenticated
  using (employee_id = public.current_employee_id() or public.can_access_employee('employees.assign_role', employee_id));

create trigger employee_extra_roles_audit after insert or delete on public.employee_extra_roles
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- The HR dashboard's figures, in one call
-- ---------------------------------------------------------------------------

create function public.get_hr_dashboard(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := public.india_today();
  v_trend_from date := greatest(p_from, p_to - 59);
begin
  if not public.has_permission('hr.dashboard') then
    raise exception 'You do not have permission to open the HR dashboard.' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.employees),
    'active', (select count(*) from public.employees where is_active),
    'newJoinings', (select count(*) from public.employees where joining_date between p_from and p_to),
    'onLeaveToday', (
      select count(distinct r.employee_id) from public.leave_requests r
      join public.employees e on e.id = r.employee_id and e.is_active
      where r.status = 'approved' and v_today between r.start_date and r.end_date
    ),
    'presentToday', (
      select count(*) from public.attendance_records a
      join public.employees e on e.id = a.employee_id and e.is_active
      where a.work_date = v_today and a.check_in_at is not null
    ),
    'pendingLeave', (select count(*) from public.leave_requests where status = 'pending'),
    'servingNotice', (select count(*) from public.employees where is_active and employment_status = 'notice_period'),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'count', people) order by people desc, name)
      from (
        select coalesce(d.name, 'No department') as name, count(*) as people
        from public.employees e
        left join public.departments d on d.id = e.department_id
        where e.is_active
        group by coalesce(d.name, 'No department')
      ) counts
    ), '[]'::jsonb),
    -- Present people per working day, for at most the last 60 days of the period.
    'attendanceTrend', coalesce((
      select jsonb_agg(jsonb_build_object('date', day::date, 'present', (
        select count(*) from public.attendance_records a
        where a.work_date = day::date and a.check_in_at is not null
      )) order by day)
      from generate_series(v_trend_from, least(p_to, v_today), interval '1 day') as day
      where public.count_working_days(day::date, day::date) = 1
    ), '[]'::jsonb),
    'leaveByType', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'days', days) order by days desc)
      from (
        select t.name, sum(r.days) as days
        from public.leave_requests r
        join public.leave_types t on t.id = r.leave_type_id
        where r.status = 'approved' and r.start_date between p_from and p_to
        group by t.name
      ) by_type
    ), '[]'::jsonb),
    -- Work anniversaries in the next 30 days, for people with at least a year in.
    'anniversaries', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'date', next_date, 'years', years) order by next_date)
      from (
        select e.id, e.full_name, next_date, extract(year from age(next_date, e.joining_date))::integer as years
        from public.employees e
        cross join lateral (
          select (e.joining_date + make_interval(years => (extract(year from age(v_today, e.joining_date))::integer + 1)))::date as candidate,
                 (e.joining_date + make_interval(years => extract(year from age(v_today, e.joining_date))::integer))::date as this_year
        ) d
        cross join lateral (select case when d.this_year >= v_today then d.this_year else d.candidate end as next_date) n
        where e.is_active and e.joining_date is not null and e.joining_date < v_today
          and next_date <= v_today + 30
      ) upcoming
      where years >= 1
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select on public.employee_extra_roles to authenticated;
grant execute on function public.current_role_id() to authenticated;
grant execute on function public.permission_scope_for(text) to authenticated;
grant execute on function public.get_my_permissions() to authenticated;
grant execute on function public.employee_has_permission(uuid, text) to authenticated;
grant execute on function public.get_my_roles() to authenticated;
grant execute on function public.switch_my_role(uuid) to authenticated;
grant execute on function public.set_employee_extra_roles(uuid, uuid[]) to authenticated;
grant execute on function public.get_hr_dashboard(date, date) to authenticated;
grant execute on function public.can_decide_leave_row(public.leave_requests) to authenticated;
revoke execute on function public.employees_with_permission(text, public.permission_scope) from authenticated;
