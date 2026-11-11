-- Stage 3 of the HR and Finance build: attendance and leave.
--
-- * Attendance: working from home chosen at check-in, breaks, a day status HR can set
--   (present, half day, absent, leave, holiday, week off), and overtime beyond a number
--   of hours HR chooses. The overtime and half-day thresholds stay empty until HR sets
--   them, as the owner asked.
-- * Leave: unused days can carry forward per leave type, up to a cap and with an expiry,
--   by a year-end job. Leave types can be marked as encashable. A utilisation report.
-- * Holidays: public or company, with a description.
-- Imports, including Pagerbook later, keep working unchanged.

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

create type public.attendance_work_mode as enum ('office', 'wfh');
create type public.attendance_day_status as enum ('present', 'half_day', 'absent', 'leave', 'holiday', 'week_off');

alter table public.attendance_records
  add column work_mode public.attendance_work_mode not null default 'office',
  -- Set by HR when the worked out status is wrong, such as a half day.
  add column status_override public.attendance_day_status;

alter table public.company_settings
  add column overtime_after_minutes integer check (overtime_after_minutes between 60 and 1440),
  add column half_day_minutes integer check (half_day_minutes between 30 and 1440);

create table public.attendance_breaks (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance_records (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_breaks_order check (ended_at is null or ended_at >= started_at)
);
-- One open break at a time is checked by attendance_start_break. A unique index here
-- would make the link to the attendance record look one-to-one to the query builder.
create index attendance_breaks_attendance_idx on public.attendance_breaks (attendance_id);

drop function public.attendance_check_in();

-- As before, plus where the person is working today.
create function public.attendance_check_in(p_work_mode public.attendance_work_mode default 'office')
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
  insert into public.attendance_records (employee_id, work_date, check_in_at, source, work_mode)
  values (v_actor, v_today, now(), 'web', coalesce(p_work_mode, 'office'))
  on conflict (employee_id, work_date) do update
    set check_in_at = now(), source = 'web', work_mode = coalesce(p_work_mode, 'office');
end;
$$;

-- As before, and a break still running ends at check-out.
create or replace function public.attendance_check_out()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_record uuid;
begin
  perform set_config('app.trusted_attendance', 'on', true);
  update public.attendance_records
  set check_out_at = now()
  where employee_id = v_actor and work_date = public.india_today()
    and check_in_at is not null and check_out_at is null
  returning id into v_record;

  if v_record is null then
    raise exception 'Check in first, or you have already checked out.' using errcode = 'check_violation';
  end if;

  update public.attendance_breaks set ended_at = now() where attendance_id = v_record and ended_at is null;
end;
$$;

create function public.attendance_start_break()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_record uuid;
begin
  -- Locks the day's record, so two quick clicks cannot open two breaks.
  select id into v_record from public.attendance_records
  where employee_id = v_actor and work_date = public.india_today()
    and check_in_at is not null and check_out_at is null
  for update;
  if v_record is null then
    raise exception 'Check in first to take a break.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.attendance_breaks where attendance_id = v_record and ended_at is null) then
    raise exception 'You are already on a break.' using errcode = 'check_violation';
  end if;

  insert into public.attendance_breaks (attendance_id, employee_id) values (v_record, v_actor);
end;
$$;

create function public.attendance_end_break()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  update public.attendance_breaks b
  set ended_at = now()
  from public.attendance_records a
  where a.id = b.attendance_id and a.employee_id = v_actor and a.work_date = public.india_today()
    and b.ended_at is null;
  if not found then
    raise exception 'You are not on a break.' using errcode = 'check_violation';
  end if;
end;
$$;

-- As before, plus work mode, the day status HR set, and minutes spent on breaks.
create or replace function public.get_attendance_report_data(p_from date, p_to date)
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
        'check_out_at', a.check_out_at, 'source', a.source, 'work_mode', a.work_mode,
        'status_override', a.status_override,
        'break_minutes', coalesce((
          select round(sum(extract(epoch from (b.ended_at - b.started_at)) / 60))::integer
          from public.attendance_breaks b where b.attendance_id = a.id and b.ended_at is not null
        ), 0)))
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
-- Holidays
-- ---------------------------------------------------------------------------

alter table public.holidays
  add column kind text not null default 'public' check (kind in ('public', 'company')),
  add column description text check (length(description) <= 500);

-- ---------------------------------------------------------------------------
-- Leave carry forward and encashment
-- ---------------------------------------------------------------------------

alter table public.leave_types
  -- Unused days that move to next year, at most this many. Empty means none carry forward.
  add column carry_forward_cap numeric(5, 1) check (carry_forward_cap > 0 and carry_forward_cap <= 365),
  -- Carried days lapse this many months into the new year. Empty means they last all year.
  add column carry_forward_expiry_months integer check (carry_forward_expiry_months between 1 and 12),
  add column is_encashable boolean not null default false;

create table public.leave_carry_forwards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  -- Unused in this year, usable in the next.
  from_year integer not null check (from_year between 2000 and 2200),
  days numeric(5, 1) not null check (days > 0),
  expires_on date,
  created_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, from_year)
);

-- Days carried into p_year that can be used on p_on. Once they lapse, only what was
-- already booked by the expiry date still counts, so earlier leave is never undone.
create function public.leave_carried_in(p_employee uuid, p_type uuid, p_year integer, p_on date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(
    case when c.expires_on is null or p_on <= c.expires_on then c.days
         else least(c.days, (
           select coalesce(sum(r.days), 0) from public.leave_requests r
           where r.employee_id = p_employee and r.leave_type_id = p_type
             and r.status in ('pending', 'approved')
             and extract(year from r.start_date) = p_year and r.start_date <= c.expires_on
         ))
    end), 0)
  from public.leave_carry_forwards c
  where c.employee_id = p_employee and c.leave_type_id = p_type and c.from_year = p_year - 1
$$;

-- As before, but carried forward days add to the allowance.
create or replace function public.guard_leave_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_type public.leave_types;
  v_taken numeric;
  v_available numeric;
  v_year integer;
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
    v_year := extract(year from new.start_date)::integer;
    v_taken := public.leave_days_taken(new.employee_id, new.leave_type_id, v_year);
    v_available := v_type.yearly_allowance + public.leave_carried_in(new.employee_id, new.leave_type_id, v_year, new.start_date);
    if v_taken + new.days > v_available then
      raise exception 'Not enough % left. You have % days remaining.',
        v_type.name, trim_scale(greatest(v_available - v_taken, 0))
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop function public.get_leave_balances(uuid, integer);

-- As before, plus the days carried forward from last year and whether the type can be
-- encashed. Remaining counts carried days that can still be used today.
create function public.get_leave_balances(p_employee uuid default null, p_year integer default null)
returns table (
  leave_type_id uuid, name text, yearly_allowance numeric, is_paid boolean,
  requires_attachment boolean, approved numeric, pending numeric, remaining numeric,
  carried_forward numeric, is_encashable boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_employee uuid := coalesce(p_employee, v_actor);
  v_year integer := coalesce(p_year, extract(year from public.india_today())::integer);
  v_on date := least(greatest(public.india_today(), make_date(v_year, 1, 1)), make_date(v_year, 12, 31));
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
         else t.yearly_allowance + public.leave_carried_in(v_employee, t.id, v_year, v_on)
              - coalesce(sum(r.days) filter (where r.status in ('approved', 'pending')), 0) end,
    public.leave_carried_in(v_employee, t.id, v_year, v_on),
    t.is_encashable
  from public.leave_types t
  left join public.leave_requests r
    on r.leave_type_id = t.id and r.employee_id = v_employee and extract(year from r.start_date) = v_year
  where t.is_active
  group by t.id
  order by t.sort_order, t.name;
end;
$$;

-- Moves each person's unused days from p_year into the next year, up to each leave
-- type's cap. Only approved leave counts as used. Safe to run again: it replaces what
-- it worked out before. Runs by itself early on 1 January, and HR can run it too.
create function public.carry_forward_leave(p_year integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is not null and not public.has_permission('hr.manage') then
    raise exception 'You do not have permission to carry leave forward.' using errcode = 'insufficient_privilege';
  end if;
  if p_year >= extract(year from public.india_today())::integer then
    raise exception 'Leave can be carried forward only once the year is over.' using errcode = 'check_violation';
  end if;

  with unused as (
    select e.id as employee_id, t.id as leave_type_id,
           least(t.carry_forward_cap, greatest(
             t.yearly_allowance + public.leave_carried_in(e.id, t.id, p_year, make_date(p_year, 12, 31))
             - coalesce((
               select sum(r.days) from public.leave_requests r
               where r.employee_id = e.id and r.leave_type_id = t.id and r.status = 'approved'
                 and extract(year from r.start_date) = p_year
             ), 0), 0)) as days,
           case when t.carry_forward_expiry_months is null then null
                else (make_date(p_year + 1, 1, 1) + make_interval(months => t.carry_forward_expiry_months) - interval '1 day')::date
           end as expires_on
    from public.employees e
    cross join public.leave_types t
    where e.is_active and t.is_active and t.carry_forward_cap is not null and t.yearly_allowance is not null
  ),
  removed as (
    delete from public.leave_carry_forwards c
    using unused u
    where c.employee_id = u.employee_id and c.leave_type_id = u.leave_type_id and c.from_year = p_year and u.days <= 0
  ),
  saved as (
    insert into public.leave_carry_forwards (employee_id, leave_type_id, from_year, days, expires_on)
    select employee_id, leave_type_id, p_year, days, expires_on from unused where days > 0
    on conflict (employee_id, leave_type_id, from_year) do update
      set days = excluded.days, expires_on = excluded.expires_on, created_at = now()
    returning 1
  )
  select count(*) into v_count from saved;

  return v_count;
end;
$$;

select cron.schedule('carry-forward-leave', '30 0 1 1 *',
  $$select public.carry_forward_leave(extract(year from public.india_today())::integer - 1)$$);

-- Every active person's leave for a year, by type, for HR.
create function public.get_leave_utilisation(p_year integer)
returns table (
  employee_id uuid, full_name text, department_name text, leave_type_id uuid, leave_type text,
  yearly_allowance numeric, carried_forward numeric, approved numeric, pending numeric,
  remaining numeric, is_encashable boolean
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_on date := least(greatest(public.india_today(), make_date(p_year, 1, 1)), make_date(p_year, 12, 31));
begin
  if not public.has_permission('hr.manage') then
    raise exception 'You do not have permission to see the leave report.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select e.id, e.full_name, d.name, t.id, t.name, t.yearly_allowance,
         public.leave_carried_in(e.id, t.id, p_year, v_on),
         coalesce(sum(r.days) filter (where r.status = 'approved'), 0),
         coalesce(sum(r.days) filter (where r.status = 'pending'), 0),
         case when t.yearly_allowance is null then null
              else t.yearly_allowance + public.leave_carried_in(e.id, t.id, p_year, v_on)
                   - coalesce(sum(r.days) filter (where r.status in ('approved', 'pending')), 0) end,
         t.is_encashable
  from public.employees e
  cross join public.leave_types t
  left join public.departments d on d.id = e.department_id
  left join public.leave_requests r
    on r.employee_id = e.id and r.leave_type_id = t.id and extract(year from r.start_date) = p_year
  where e.is_active and t.is_active
  group by e.id, d.name, t.id
  order by e.full_name, t.sort_order, t.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger leave_carry_forwards_audit after insert or update or delete on public.leave_carry_forwards
  for each row execute function public.audit_row_change();

alter table public.attendance_breaks enable row level security;
alter table public.leave_carry_forwards enable row level security;

-- Breaks are added only by starting and ending them, through the functions above.
create policy attendance_breaks_select on public.attendance_breaks for select to authenticated
  using (public.can_access_employee('attendance.view', employee_id));

create policy leave_carry_forwards_select on public.leave_carry_forwards for select to authenticated
  using (
    employee_id = public.current_employee_id()
    or public.can_access_employee('leave.approve', employee_id)
    or public.permission_scope_for('hr.manage') = 'organisation'
  );

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select on public.attendance_breaks to authenticated;
grant select on public.leave_carry_forwards to authenticated;

grant execute on function public.attendance_check_in(public.attendance_work_mode) to authenticated;
grant execute on function public.attendance_check_out() to authenticated;
grant execute on function public.attendance_start_break() to authenticated;
grant execute on function public.attendance_end_break() to authenticated;
grant execute on function public.get_attendance_report_data(date, date) to authenticated;
grant execute on function public.get_leave_balances(uuid, integer) to authenticated;
grant execute on function public.carry_forward_leave(integer) to authenticated;
grant execute on function public.get_leave_utilisation(integer) to authenticated;
revoke execute on function public.leave_carried_in(uuid, uuid, integer, date) from authenticated;
