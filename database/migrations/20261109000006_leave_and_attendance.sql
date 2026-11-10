-- Working hours, holidays, leave and attendance. Attendance can come from the web
-- check-in, manual corrections or an import, so a system such as Pagerbook can feed
-- it later without anything here depending on it.

-- ---------------------------------------------------------------------------
-- Company working pattern. One row, editable in Settings > HR.
-- ---------------------------------------------------------------------------

create table public.company_settings (
  id boolean primary key default true check (id),
  work_start time not null default '09:30',
  work_end time not null default '18:30',
  late_grace_minutes integer not null default 15 check (late_grace_minutes between 0 and 240),
  -- ISO weekday numbers: 1 is Monday, 7 is Sunday.
  working_days integer[] not null default '{1,2,3,4,5}'
    check (working_days <@ '{1,2,3,4,5,6,7}' and cardinality(working_days) between 1 and 7),
  updated_at timestamptz not null default now(),
  constraint company_settings_hours check (work_end > work_start)
);
insert into public.company_settings default values;

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  -- Days per calendar year. Empty means no limit, as for unpaid leave.
  yearly_allowance numeric(5, 1) check (yearly_allowance >= 0),
  is_paid boolean not null default true,
  requires_attachment boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leave_types_name_unique on public.leave_types (lower(name));

insert into public.leave_types (name, yearly_allowance, is_paid, sort_order) values
  ('Casual Leave', 12, true, 10),
  ('Sick Leave', 6, true, 20),
  ('Earned Leave', 15, true, 30),
  ('Unpaid Leave', null, false, 40);

create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  is_half_day boolean not null default false,
  -- Working days, worked out by the database from the working pattern and holidays.
  days numeric(5, 1) not null default 0,
  reason text not null check (length(trim(reason)) between 3 and 2000),
  attachment_file_id uuid references public.files (id) on delete set null,
  status public.leave_status not null default 'pending',
  -- The reporting manager when the request was made.
  approver_id uuid references public.employees (id) on delete set null,
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_dates check (end_date >= start_date),
  constraint leave_requests_half_day check (not is_half_day or start_date = end_date),
  constraint leave_requests_one_year check (extract(year from start_date) = extract(year from end_date))
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_approver_idx on public.leave_requests (approver_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

create type public.attendance_source as enum ('web', 'manual', 'import');

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  source public.attendance_source not null default 'web',
  note text check (length(note) <= 500),
  updated_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date),
  constraint attendance_records_order check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);
create index attendance_records_date_idx on public.attendance_records (work_date);

-- ---------------------------------------------------------------------------
-- Calculations
-- ---------------------------------------------------------------------------

create function public.india_today()
returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- Days in the range that are working days and not holidays.
create function public.count_working_days(p_start date, p_end date)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from generate_series(p_start, p_end, interval '1 day') as day
  where exists (
      select 1 from public.company_settings s
      where extract(isodow from day)::integer = any (s.working_days)
    )
    and not exists (select 1 from public.holidays h where h.holiday_date = day::date)
$$;

create function public.leave_days_taken(p_employee uuid, p_type uuid, p_year integer, p_exclude uuid default null)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(days), 0)
  from public.leave_requests
  where employee_id = p_employee
    and leave_type_id = p_type
    and status in ('pending', 'approved')
    and extract(year from start_date) = p_year
    and id is distinct from p_exclude
$$;

-- ---------------------------------------------------------------------------
-- Leave access
-- ---------------------------------------------------------------------------

-- The reporting manager at the time of the request, or anyone whose leave approval
-- reaches the employee. Nobody approves their own leave.
create function public.can_decide_leave_row(v_request public.leave_requests)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or v_request.employee_id = v_actor then
    return false;
  end if;
  return v_request.approver_id = v_actor
    or public.can_access_employee('leave.approve', v_request.employee_id);
end;
$$;

create function public.can_view_leave_row(v_request public.leave_requests)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select v_request.employee_id = public.current_employee_id()
    or public.can_decide_leave_row(v_request)
    or public.permission_scope_for('hr.manage') = 'organisation'
$$;

create function public.get_leave_balances(p_employee uuid default null, p_year integer default null)
returns table (
  leave_type_id uuid, name text, yearly_allowance numeric, is_paid boolean,
  requires_attachment boolean, approved numeric, pending numeric, remaining numeric
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_employee uuid := coalesce(p_employee, v_actor);
  v_year integer := coalesce(p_year, extract(year from public.india_today())::integer);
begin
  if v_actor is null or (v_employee <> v_actor and not public.can_access_employee('leave.approve', v_employee)
     and public.permission_scope_for('hr.manage') is distinct from 'organisation') then
    return;
  end if;

  return query
  select
    t.id, t.name, t.yearly_allowance, t.is_paid, t.requires_attachment,
    coalesce(sum(r.days) filter (where r.status = 'approved'), 0),
    coalesce(sum(r.days) filter (where r.status = 'pending'), 0),
    case when t.yearly_allowance is null then null
         else t.yearly_allowance - coalesce(sum(r.days) filter (where r.status in ('approved', 'pending')), 0) end
  from public.leave_types t
  left join public.leave_requests r
    on r.leave_type_id = t.id and r.employee_id = v_employee and extract(year from r.start_date) = v_year
  where t.is_active
  group by t.id
  order by t.sort_order, t.name;
end;
$$;

-- Approved leave of colleagues in the same department, plus anyone the user approves
-- leave for. Only names, dates and types are shown, never the reason.
create function public.get_team_leave(p_from date, p_to date)
returns table (
  request_id uuid, employee_id uuid, full_name text, department_name text,
  leave_type text, start_date date, end_date date, is_half_day boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_department uuid;
begin
  if v_actor is null then
    return;
  end if;
  select department_id into v_department from public.employees where id = v_actor;

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
      or (v_department is not null and e.department_id = v_department)
      or public.can_access_employee('leave.approve', e.id)
      or public.permission_scope_for('hr.manage') = 'organisation'
    )
  order by r.start_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leave rules
-- ---------------------------------------------------------------------------

create function public.guard_leave_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_type public.leave_types;
  v_taken numeric;
begin
  if (select auth.uid()) is not null then
    new.employee_id := public.current_employee_id();
    if new.employee_id is null or not public.has_permission('leave.request') then
      raise exception 'You do not have permission to request leave.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  select reporting_manager_id into new.approver_id from public.employees where id = new.employee_id;

  select * into v_type from public.leave_types where id = new.leave_type_id and is_active;
  if not found then
    raise exception 'Choose a valid leave type.' using errcode = 'check_violation';
  end if;
  if v_type.requires_attachment and new.attachment_file_id is null then
    raise exception '% needs a supporting document.', v_type.name using errcode = 'check_violation';
  end if;
  if new.attachment_file_id is not null and (select auth.uid()) is not null
     and not public.owns_file(new.attachment_file_id) then
    raise exception 'You can only attach your own files.' using errcode = 'insufficient_privilege';
  end if;

  new.days := case when new.is_half_day then 0.5 else public.count_working_days(new.start_date, new.end_date) end;
  if new.is_half_day and public.count_working_days(new.start_date, new.end_date) = 0 then
    new.days := 0;
  end if;
  if new.days = 0 then
    raise exception 'Those dates fall on days off or holidays, so no leave is needed.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.leave_requests r
    where r.employee_id = new.employee_id
      and r.status in ('pending', 'approved')
      and r.start_date <= new.end_date and r.end_date >= new.start_date
  ) then
    raise exception 'You already have leave booked on some of these dates.' using errcode = 'check_violation';
  end if;

  if v_type.yearly_allowance is not null then
    v_taken := public.leave_days_taken(new.employee_id, new.leave_type_id, extract(year from new.start_date)::integer);
    if v_taken + new.days > v_type.yearly_allowance then
      raise exception 'Not enough % left. You have % days remaining.',
        v_type.name, trim_scale(greatest(v_type.yearly_allowance - v_taken, 0))
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger leave_requests_guard_insert before insert on public.leave_requests
  for each row execute function public.guard_leave_insert();

create function public.guard_leave_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_allowed boolean := false;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (to_jsonb(new) - array['status', 'decision_note', 'decided_by', 'decided_at', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'decision_note', 'decided_by', 'decided_at', 'updated_at']) then
    raise exception 'A leave request cannot be edited. Cancel it and make a new one.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is not distinct from old.status then
    raise exception 'Nothing to change.' using errcode = 'check_violation';
  end if;

  if old.status = 'pending' and new.status in ('approved', 'rejected') and public.can_decide_leave_row(old) then
    v_allowed := true;
  elsif old.status = 'pending' and new.status = 'cancelled' and old.employee_id = v_actor then
    v_allowed := true;
  elsif old.status = 'approved' and new.status = 'cancelled' and (
    (old.employee_id = v_actor and old.start_date > public.india_today())
    or public.permission_scope_for('hr.manage') = 'organisation'
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'You cannot change this leave request.' using errcode = 'insufficient_privilege';
  end if;

  new.decided_by := v_actor;
  new.decided_at := now();
  return new;
end;
$$;

create trigger leave_requests_guard_update before update on public.leave_requests
  for each row execute function public.guard_leave_update();

create function public.notify_leave_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_summary text;
begin
  select e.full_name || ': ' || t.name || ', ' || to_char(new.start_date, 'DD Mon')
    || case when new.end_date > new.start_date then ' to ' || to_char(new.end_date, 'DD Mon') else '' end
    into v_summary
  from public.employees e, public.leave_types t
  where e.id = new.employee_id and t.id = new.leave_type_id;

  if tg_op = 'INSERT' then
    perform public.notify(new.approver_id, 'leave_requested', 'A leave request needs your approval', v_summary, '/approvals');
    return null;
  end if;

  if new.status in ('approved', 'rejected') then
    perform public.notify(new.employee_id, 'leave_decided',
      'Your leave was ' || new.status::text, v_summary || coalesce(' (' || new.decision_note || ')', ''), '/leave',
      case when new.status = 'rejected' then 'high' else 'normal' end::public.notification_priority);
  elsif new.status = 'cancelled' and old.status = 'approved' then
    select full_name into v_name from public.employees where id = new.employee_id;
    perform public.notify(new.approver_id, 'leave_decided', 'Approved leave was cancelled', v_summary, '/leave');
    perform public.notify(new.employee_id, 'leave_decided', 'Your approved leave was cancelled', v_summary, '/leave');
  end if;
  return null;
end;
$$;

create trigger leave_requests_notify after insert or update of status on public.leave_requests
  for each row execute function public.notify_leave_events();

-- ---------------------------------------------------------------------------
-- Attendance rules
-- ---------------------------------------------------------------------------

-- Check-in and check-out use the server's clock, so nobody can backdate them.
create function public.attendance_check_in()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_today date := public.india_today();
begin
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.attendance_records
    where employee_id = v_actor and work_date = v_today and check_in_at is not null
  ) then
    raise exception 'You have already checked in today.' using errcode = 'check_violation';
  end if;

  perform set_config('app.trusted_attendance', 'on', true);
  insert into public.attendance_records (employee_id, work_date, check_in_at, source)
  values (v_actor, v_today, now(), 'web')
  on conflict (employee_id, work_date) do update set check_in_at = now(), source = 'web';
end;
$$;

create function public.attendance_check_out()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  perform set_config('app.trusted_attendance', 'on', true);
  update public.attendance_records
  set check_out_at = now()
  where employee_id = v_actor and work_date = public.india_today()
    and check_in_at is not null and check_out_at is null;

  if not found then
    raise exception 'Check in first, or you have already checked out.' using errcode = 'check_violation';
  end if;
end;
$$;

-- Manual corrections by HR. Nobody corrects their own attendance. Check-in, check-out
-- and imports mark themselves as trusted for their own transaction, and users cannot
-- set that flag, because the API only exposes the public schema.
create function public.guard_attendance_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or pg_trigger_depth() > 1
     or current_setting('app.trusted_attendance', true) = 'on' then
    return new;
  end if;
  if new.employee_id = public.current_employee_id() then
    raise exception 'You cannot correct your own attendance.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.employee_id <> old.employee_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;
  new.source := 'manual';
  new.updated_by := public.current_employee_id();
  return new;
end;
$$;

create trigger attendance_records_guard before insert or update on public.attendance_records
  for each row execute function public.guard_attendance_change();

-- Imports rows from a file or another system. Times can be "09:30" in Indian time, or
-- full timestamps. Manual corrections are never overwritten. Without a signed-in user,
-- which means the import API using the service role, the scope check is skipped.
create function public.import_attendance(p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_is_system boolean := (select auth.uid()) is null;
  v_row jsonb;
  v_employee uuid;
  v_date date;
  v_in timestamptz;
  v_out timestamptz;
  v_imported integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_line integer := 0;
begin
  if not v_is_system and not public.has_permission('attendance.manage') then
    raise exception 'You do not have permission to import attendance.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send up to 5000 rows at a time.' using errcode = 'check_violation';
  end if;

  -- Imported rows keep the "import" source instead of becoming manual corrections.
  perform set_config('app.trusted_attendance', 'on', true);

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1;
    begin
      select id into v_employee from public.employees
      where is_active and (
        lower(work_email) = lower(v_row ->> 'employee')
        or upper(employee_code) = upper(v_row ->> 'employee')
      );
      if v_employee is null then
        raise exception 'No active employee matches "%"', v_row ->> 'employee';
      end if;
      if not v_is_system and not public.can_access_employee('attendance.manage', v_employee) then
        raise exception 'Outside your access';
      end if;

      v_date := (v_row ->> 'date')::date;
      v_in := case
        when coalesce(v_row ->> 'check_in', '') = '' then null
        when v_row ->> 'check_in' ~ '^\d{1,2}:\d{2}$' then ((v_date::text || ' ' || (v_row ->> 'check_in'))::timestamp at time zone 'Asia/Kolkata')
        else (v_row ->> 'check_in')::timestamptz
      end;
      v_out := case
        when coalesce(v_row ->> 'check_out', '') = '' then null
        when v_row ->> 'check_out' ~ '^\d{1,2}:\d{2}$' then ((v_date::text || ' ' || (v_row ->> 'check_out'))::timestamp at time zone 'Asia/Kolkata')
        else (v_row ->> 'check_out')::timestamptz
      end;

      insert into public.attendance_records (employee_id, work_date, check_in_at, check_out_at, source)
      values (v_employee, v_date, v_in, v_out, 'import')
      on conflict (employee_id, work_date) do update
        set check_in_at = excluded.check_in_at, check_out_at = excluded.check_out_at, source = 'import'
        where public.attendance_records.source <> 'manual';

      v_imported := v_imported + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('line', v_line, 'error', sqlerrm);
    end;
    v_employee := null;
  end loop;

  return jsonb_build_object('imported', v_imported, 'errors', v_errors);
end;
$$;

-- Everything a monthly report needs, limited to the people the user may see.
create function public.get_attendance_report_data(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if v_actor is null or not public.has_permission('attendance.view') or p_to < p_from or p_to - p_from > 62 then
    return null;
  end if;

  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' - 'updated_at' from public.company_settings s),
    'holidays', coalesce((
      select jsonb_agg(holiday_date) from public.holidays where holiday_date between p_from and p_to
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name, 'department', d.name) order by e.full_name)
      from public.employees e
      left join public.departments d on d.id = e.department_id
      where e.is_active and public.can_access_employee('attendance.view', e.id)
    ), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', a.employee_id, 'work_date', a.work_date, 'check_in_at', a.check_in_at,
        'check_out_at', a.check_out_at, 'source', a.source))
      from public.attendance_records a
      where a.work_date between p_from and p_to and public.can_access_employee('attendance.view', a.employee_id)
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', r.employee_id, 'start_date', r.start_date, 'end_date', r.end_date, 'is_half_day', r.is_half_day))
      from public.leave_requests r
      where r.status = 'approved' and r.start_date <= p_to and r.end_date >= p_from
        and public.can_access_employee('attendance.view', r.employee_id)
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger company_settings_set_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();
create trigger leave_types_set_updated_at before update on public.leave_types
  for each row execute function public.set_updated_at();
create trigger leave_requests_set_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();
create trigger attendance_records_set_updated_at before update on public.attendance_records
  for each row execute function public.set_updated_at();

create trigger company_settings_audit after update on public.company_settings
  for each row execute function public.audit_row_change();
create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function public.audit_row_change();
create trigger leave_types_audit after insert or update or delete on public.leave_types
  for each row execute function public.audit_row_change();
create trigger leave_requests_audit after insert or update on public.leave_requests
  for each row execute function public.audit_row_change();
create trigger attendance_records_audit after update on public.attendance_records
  for each row execute function public.audit_row_change();

alter table public.company_settings enable row level security;
alter table public.holidays enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.attendance_records enable row level security;

create policy company_settings_select on public.company_settings for select to authenticated
  using (public.current_employee_id() is not null);
create policy company_settings_update on public.company_settings for update to authenticated
  using (public.has_permission('hr.manage')) with check (public.has_permission('hr.manage'));

create policy holidays_select on public.holidays for select to authenticated
  using (public.current_employee_id() is not null);
create policy holidays_write on public.holidays for all to authenticated
  using (public.has_permission('hr.manage')) with check (public.has_permission('hr.manage'));

create policy leave_types_select on public.leave_types for select to authenticated
  using (public.current_employee_id() is not null);
create policy leave_types_write on public.leave_types for all to authenticated
  using (public.has_permission('hr.manage')) with check (public.has_permission('hr.manage'));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (public.can_view_leave_row(leave_requests));
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (public.has_permission('leave.request'));
-- Status rules are applied by guard_leave_update.
create policy leave_requests_update on public.leave_requests for update to authenticated
  using (public.can_view_leave_row(leave_requests))
  with check (public.current_employee_id() is not null);

create policy attendance_records_select on public.attendance_records for select to authenticated
  using (public.can_access_employee('attendance.view', employee_id));
create policy attendance_records_insert on public.attendance_records for insert to authenticated
  with check (public.can_access_employee('attendance.manage', employee_id));
create policy attendance_records_update on public.attendance_records for update to authenticated
  using (public.can_access_employee('attendance.manage', employee_id))
  with check (public.can_access_employee('attendance.manage', employee_id));
