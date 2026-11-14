-- HR manages everyone except leadership, and the Founder is out of attendance. As the
-- owner asked:
--
-- * Two role settings, changed in Settings, Roles, so nothing checks a role's name:
--   - "Private records": the people in the role have their records (profile, personal,
--     identity and bank details, documents, attendance) seen only by themselves and by
--     people in a role with the same setting. Set for Founder and Co-Founder.
--   - "Tracks attendance": off for the Founder. People in such a role do not check in,
--     are left out of attendance reports, and absences never cost them pay.
-- * Whoever manages employees across the organisation (employees.update at
--   organisation scope, such as HR) may now manage people in any role that does not have
--   private records: details, role, account status and sign-in links. Before, they
--   could only manage people whose role's access they fully held themselves. That rule
--   still applies to everyone else, to private-record roles, and to roles given to
--   oneself.
-- * HR may assign roles, and change a person's login email.

-- ---------------------------------------------------------------------------
-- Role settings
-- ---------------------------------------------------------------------------

alter table public.roles
  add column private_records boolean not null default false,
  add column tracks_attendance boolean not null default true;

update public.roles set private_records = true
where lower(name) in ('founder', 'co-founder', 'co founder', 'cofounder');
update public.roles set tracks_attendance = false
where lower(name) = 'founder';

-- HR assigns roles too.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'employees.assign_role', 'organisation'
from public.roles r
where lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- Private records
-- ---------------------------------------------------------------------------

-- Whether any of the person's roles, main or additional, keeps their record private.
create function public.employee_has_private_record(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    join public.roles r on r.id = e.role_id
    where e.id = p_employee and r.private_records
  ) or exists (
    select 1 from public.employee_extra_roles x
    join public.roles r on r.id = x.role_id
    where x.employee_id = p_employee and r.private_records
  )
$$;

-- The signed-in person may see this person's record: their own, anyone without a
-- private record, or anyone at all when acting in a role with private records.
create function public.can_see_employee_record(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and (
    p_employee = public.current_employee_id()
    or not public.employee_has_private_record(p_employee)
    or coalesce((select private_records from public.roles where id = public.current_role_id()), false)
  )
$$;

-- The people whose records the signed-in person may not see, for lists.
create function public.get_hidden_employee_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id from public.employees e where not public.can_see_employee_record(e.id)
$$;

-- ---------------------------------------------------------------------------
-- Who may be managed
-- ---------------------------------------------------------------------------

-- The earlier rule, kept under a clearer name: the signed-in person's role holds every
-- permission of this role, at the same scope or wider.
create function public.role_within_own_access(p_role uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = p_role
      and (
        public.permission_scope_for(rp.permission_key) is null
        or public.permission_scope_for(rp.permission_key) < rp.scope
      )
  )
$$;

-- Used wherever people are added, edited, given roles or deactivated. Organisation-wide
-- people managers may also handle any role without private records.
create or replace function public.role_is_assignable(p_role uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and (
    public.role_within_own_access(p_role)
    or (
      public.permission_scope_for('employees.update') = 'organisation'
      and not coalesce((select private_records from public.roles where id = p_role), false)
    )
  )
$$;

-- As before, plus: never for someone whose record is hidden, and a role given to
-- oneself must be within one's own access, so nobody can raise their own access.
create or replace function public.set_employee_extra_roles(p_employee uuid, p_roles uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_main uuid;
  v_role uuid;
  v_is_self boolean := p_employee = public.current_employee_id();
begin
  if not public.can_access_employee('employees.assign_role', p_employee)
     or not public.can_see_employee_record(p_employee) then
    raise exception 'You do not have permission to assign roles to this person.' using errcode = 'insufficient_privilege';
  end if;
  select role_id into v_main from public.employees where id = p_employee;
  if not v_is_self and not public.role_is_assignable(v_main) then
    raise exception 'You do not have permission to assign roles to this person.' using errcode = 'insufficient_privilege';
  end if;
  foreach v_role in array coalesce(p_roles, '{}') loop
    if v_role = v_main then
      continue;
    end if;
    -- Roles the person already has are left alone; only new ones are checked.
    if exists (select 1 from public.employee_extra_roles where employee_id = p_employee and role_id = v_role) then
      continue;
    end if;
    if not public.role_is_assignable(v_role) or (v_is_self and not public.role_within_own_access(v_role)) then
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

-- Changes the email a person signs in with, on the login and the employee record. A
-- linked Google account is unlinked, because it belonged to the old address; the person
-- links it again by signing in with Google at the new one.
create function public.change_employee_login_email(p_employee uuid, p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_employee public.employees;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_employee from public.employees where id = p_employee;
  if v_actor is null or v_employee.id is null
     or not public.can_access_employee('employees.update', p_employee)
     or not public.can_see_employee_record(p_employee)
     or not public.role_is_assignable(v_employee.role_id) then
    raise exception 'You do not have permission to change this login email.' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = 'check_violation';
  end if;
  if v_email = v_employee.work_email then
    return;
  end if;
  if exists (select 1 from public.employees where work_email = v_email and id <> p_employee)
     or exists (select 1 from app_auth.users where email = v_email and id is distinct from v_employee.auth_user_id) then
    raise exception 'Someone already uses this email.' using errcode = 'unique_violation';
  end if;

  if v_employee.auth_user_id is not null then
    update app_auth.users set email = v_email, updated_at = now() where id = v_employee.auth_user_id;
    delete from app_auth.user_identities where user_id = v_employee.auth_user_id;
  end if;

  perform set_config('app.trusted_employee_update', 'on', true);
  update public.employees set work_email = v_email where id = p_employee;
  perform set_config('app.trusted_employee_update', 'off', true);

  select full_name into v_actor_name from public.employees where id = v_actor;
  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (v_actor, coalesce(v_actor_name, 'System'), 'changed login email of', 'employees', p_employee::text,
          jsonb_build_object('label', v_employee.full_name, 'from', v_employee.work_email, 'to', v_email));
end;
$$;

-- ---------------------------------------------------------------------------
-- Records: personal, identity and bank details, documents
-- ---------------------------------------------------------------------------

create or replace function public.can_see_personal_details(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null
    and public.can_see_employee_record(p_employee)
    and (
      p_employee = public.current_employee_id()
      or public.can_manage_private_details()
      or public.can_access_employee('employees.update', p_employee)
    )
$$;

drop policy employee_private_details_select on public.employee_private_details;
drop policy employee_private_details_insert on public.employee_private_details;
drop policy employee_private_details_update on public.employee_private_details;
create policy employee_private_details_select on public.employee_private_details for select to authenticated
  using (employee_id = public.current_employee_id()
         or (public.can_manage_private_details() and public.can_see_employee_record(employee_id)));
create policy employee_private_details_insert on public.employee_private_details for insert to authenticated
  with check (public.can_manage_private_details() and public.can_see_employee_record(employee_id));
create policy employee_private_details_update on public.employee_private_details for update to authenticated
  using (public.can_manage_private_details() and public.can_see_employee_record(employee_id))
  with check (public.can_manage_private_details() and public.can_see_employee_record(employee_id));

create or replace function public.record_private_detail_reveal(p_employee uuid, p_field text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_name text;
begin
  if v_actor is null or not (
    p_employee = v_actor or (public.can_manage_private_details() and public.can_see_employee_record(p_employee))
  ) then
    raise exception 'You do not have permission to see this.' using errcode = 'insufficient_privilege';
  end if;
  if p_field not in ('aadhaar', 'account_number') then
    raise exception 'Unknown detail.' using errcode = 'check_violation';
  end if;

  select full_name into v_actor_name from public.employees where id = v_actor;
  select full_name into v_name from public.employees where id = p_employee;

  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (v_actor, coalesce(v_actor_name, 'System'), 'revealed', 'employee_private_details', p_employee::text,
          jsonb_build_object('field', p_field, 'label', v_name));
end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

create function public.employee_tracks_attendance(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select r.tracks_attendance from public.employees e join public.roles r on r.id = e.role_id where e.id = p_employee
  ), true)
$$;

-- No attendance for people whose role does not track it, and none added or corrected
-- for people whose record is hidden from the person doing it.
create function public.guard_attendance_person()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' and not public.employee_tracks_attendance(new.employee_id) then
    select full_name into v_name from public.employees where id = new.employee_id;
    raise exception '% does not record attendance.', coalesce(v_name, 'This person') using errcode = 'check_violation';
  end if;
  if (select auth.uid()) is not null and not public.can_see_employee_record(new.employee_id) then
    raise exception 'You do not have permission to change this attendance.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger attendance_records_person before insert or update on public.attendance_records
  for each row execute function public.guard_attendance_person();

-- As before, leaving out people whose role does not track attendance and people whose
-- record is hidden from the viewer.
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
        and public.employee_tracks_attendance(e.id) and public.can_see_employee_record(e.id)
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
        and public.employee_tracks_attendance(a.employee_id) and public.can_see_employee_record(a.employee_id)
    ), '[]'::jsonb),
    'leave', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', r.employee_id, 'start_date', r.start_date, 'end_date', r.end_date, 'is_half_day', r.is_half_day))
      from public.leave_requests r
      where r.status = 'approved' and r.start_date <= p_to and r.end_date >= p_from
        and public.can_access_employee('attendance.view', r.employee_id)
        and public.employee_tracks_attendance(r.employee_id) and public.can_see_employee_record(r.employee_id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Payroll: as before, but absences only cost pay for people whose role tracks attendance.
create or replace function public.calculate_payroll_line(p_line uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_line public.payroll_lines;
  v_run public.payroll_runs;
  v_structure public.salary_structures;
  v_employee public.employees;
  v_settings public.company_settings;
  v_start date;
  v_end date;
  v_from date;
  v_to date;
  v_days integer;
  v_payable numeric := 0;
  v_absent numeric := 0;
  v_unpaid numeric := 0;
  v_lop numeric;
  v_paid numeric;
  v_ratio numeric;
  v_day date;
  v_present numeric;
  v_leave record;
  v_record public.attendance_records;
  v_overtime_minutes numeric := 0;
  v_basic numeric;
  v_hra numeric;
  v_other numeric;
  v_special numeric;
  v_fixed_gross numeric;
  v_component record;
  v_value numeric;
  v_components jsonb := '[]';
  v_component_earnings numeric := 0;
  v_component_deductions numeric := 0;
  v_untaxed numeric := 0;
  v_gross numeric;
  v_statutory record;
  v_warnings text[] := '{}';
begin
  select * into v_line from public.payroll_lines where id = p_line;
  select * into v_run from public.payroll_runs where id = v_line.run_id;
  select * into v_employee from public.employees where id = v_line.employee_id;
  select * into v_settings from public.company_settings;

  v_start := v_run.month;
  v_end := (v_run.month + interval '1 month' - interval '1 day')::date;
  v_days := extract(day from v_end)::integer;

  select * into v_structure from public.salary_structures
  where employee_id = v_line.employee_id and effective_from <= v_end
  order by effective_from desc limit 1;

  if v_structure.id is null then
    update public.payroll_lines set warnings = '{"No salary structure"}', structure_id = null,
      gross_earnings = 0, total_deductions = 0, net_pay = 0, updated_at = now()
    where id = p_line;
    return;
  end if;

  -- Days employed: from joining, up to leaving.
  v_from := greatest(v_start, coalesce(v_employee.joining_date, v_start));
  v_to := least(v_end, coalesce(public.employee_last_day(v_employee.id), v_end));
  v_payable := greatest(v_to - v_from + 1, 0);

  -- Each working day so far: approved leave first, then attendance.
  if v_payable > 0 then
    for v_day in select d::date from generate_series(v_from, least(v_to, public.india_today() - 1), interval '1 day') d loop
      if public.count_working_days(v_day, v_day) = 0 then
        continue;
      end if;

      select r.is_half_day, t.is_paid into v_leave
      from public.leave_requests r join public.leave_types t on t.id = r.leave_type_id
      where r.employee_id = v_employee.id and r.status = 'approved' and v_day between r.start_date and r.end_date
      limit 1;

      select * into v_record from public.attendance_records where employee_id = v_employee.id and work_date = v_day;

      if v_record.id is not null and v_record.check_in_at is not null and v_record.check_out_at is not null
         and v_settings.overtime_after_minutes is not null then
        v_overtime_minutes := v_overtime_minutes + greatest(
          extract(epoch from (v_record.check_out_at - v_record.check_in_at)) / 60
          - coalesce((select sum(extract(epoch from (b.ended_at - b.started_at)) / 60) from public.attendance_breaks b
                      where b.attendance_id = v_record.id and b.ended_at is not null), 0)
          - v_settings.overtime_after_minutes, 0);
      end if;

      if v_leave.is_half_day is not null and not v_leave.is_half_day then
        if not v_leave.is_paid then
          v_unpaid := v_unpaid + 1;
        end if;
        continue;
      end if;

      v_present := case
        when v_record.status_override = 'absent' then 0
        when v_record.status_override = 'half_day' then 0.5
        when v_record.status_override in ('present', 'leave', 'holiday', 'week_off') then 1
        when v_record.check_in_at is not null then 1
        else 0
      end;

      if v_leave.is_half_day then
        if not v_leave.is_paid then
          v_unpaid := v_unpaid + 0.5;
        end if;
        v_present := least(v_present + 0.5, 1);
      end if;

      if v_settings.payroll_absence_lop and public.employee_tracks_attendance(v_employee.id) then
        v_absent := v_absent + (1 - v_present);
      end if;

      v_leave := null;
      v_record := null;
    end loop;
  end if;

  v_lop := least(greatest(v_absent + v_unpaid + v_line.lop_adjustment, 0), v_payable);
  v_paid := v_payable - v_lop;
  v_ratio := v_paid / v_days;

  v_basic := round(v_structure.basic * v_ratio, 2);
  v_hra := round(v_structure.hra * v_ratio, 2);
  v_other := round(v_structure.other_allowances * v_ratio, 2);
  v_special := round(v_structure.special_allowance * v_ratio, 2);
  v_fixed_gross := v_basic + v_hra + v_other + v_special;

  for v_component in select * from public.salary_components where is_active order by sort_order, name loop
    v_value := case
      when v_component.calculation = 'fixed' and v_component.kind = 'earning' then round(v_component.amount * v_ratio, 2)
      when v_component.calculation = 'fixed' then v_component.amount
      when v_component.percentage_of = 'basic' then round(v_basic * v_component.percentage / 100, 2)
      else round(v_fixed_gross * v_component.percentage / 100, 2)
    end;
    continue when v_value = 0;
    v_components := v_components || jsonb_build_object('name', v_component.name, 'kind', v_component.kind, 'amount', v_value);
    if v_component.kind = 'earning' then
      v_component_earnings := v_component_earnings + v_value;
      if not v_component.is_taxable then
        v_untaxed := v_untaxed + v_value;
      end if;
    else
      v_component_deductions := v_component_deductions + v_value;
    end if;
  end loop;

  v_gross := v_fixed_gross + v_line.incentive + v_line.bonus + v_line.overtime_amount + v_line.other_earnings + v_component_earnings;

  select * into v_statutory from public.calculate_statutory(
    v_basic, v_gross, v_structure.gross, v_gross - v_untaxed, v_structure.pf_applies, v_structure.esi_applies,
    coalesce(v_structure.pt_state, v_settings.default_pt_state), v_structure.tds_monthly, v_end
  );
  v_warnings := v_statutory.warnings;
  if v_settings.payroll_absence_lop and v_absent > 0 then
    v_warnings := v_warnings || (trim_scale(v_absent) || ' working days without attendance or leave');
  end if;

  update public.payroll_lines set
    structure_id = v_structure.id,
    days_in_month = v_days,
    payable_days = v_payable,
    absent_days = v_absent,
    unpaid_leave_days = v_unpaid,
    lop_days = v_lop,
    paid_days = v_paid,
    overtime_hours = round(v_overtime_minutes / 60, 2),
    basic = v_basic,
    hra = v_hra,
    other_allowances = v_other,
    special_allowance = v_special,
    components = v_components,
    component_earnings = v_component_earnings,
    component_deductions = v_component_deductions,
    gross_earnings = v_gross,
    pf_employee = v_statutory.pf_employee,
    pf_employer = v_statutory.pf_employer,
    esi_employee = v_statutory.esi_employee,
    esi_employer = v_statutory.esi_employer,
    professional_tax = v_statutory.professional_tax,
    tds = v_statutory.tds,
    total_deductions = v_statutory.pf_employee + v_statutory.esi_employee + v_statutory.professional_tax
      + v_statutory.tds + v_line.other_deductions + v_component_deductions,
    net_pay = v_gross - (v_statutory.pf_employee + v_statutory.esi_employee + v_statutory.professional_tax
      + v_statutory.tds + v_line.other_deductions + v_component_deductions),
    warnings = v_warnings,
    updated_at = now()
  where id = p_line;
end;
$$;

-- Employee documents: as before, but not for people whose record is hidden.
create or replace function public.can_view_file_row(v_file public.files)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('files.view');
  v_department uuid;
begin
  if v_actor is null then
    return false;
  end if;
  if v_file.status = 'uploading' then
    return v_file.owner_id = v_actor;
  end if;
  if v_file.employee_id is not null then
    return v_file.employee_id = v_actor or v_file.owner_id = v_actor
      or (public.can_manage_private_details() and public.can_see_employee_record(v_file.employee_id));
  end if;
  if v_file.candidate_id is not null then
    return v_file.owner_id = v_actor or public.can_view_candidate(v_file.candidate_id);
  end if;
  if v_scope = 'organisation' or v_file.owner_id = v_actor then
    return true;
  end if;

  if exists (select 1 from public.reimbursements r where r.receipt_file_id = v_file.id and public.can_view_reimbursement(r.employee_id)) then
    return true;
  end if;
  if public.can_see_ledger() and (
    exists (select 1 from public.expense_records e where e.receipt_file_id = v_file.id)
    or exists (select 1 from public.income_records i where i.file_id = v_file.id)
  ) then
    return true;
  end if;
  if (public.can_manage_purchases() or public.can_see_ledger())
     and exists (select 1 from public.vendor_bills b where b.file_id = v_file.id) then
    return true;
  end if;

  select department_id into v_department from public.employees where id = v_actor;

  if exists (
    select 1 from public.file_shares s
    where s.file_id = v_file.id
      and (s.expires_at is null or s.expires_at > now())
      and (s.recipient_employee_id = v_actor or (v_department is not null and s.recipient_department_id = v_department))
  ) then
    return true;
  end if;

  if (v_file.task_id is not null and public.can_view_task(v_file.task_id))
     or (v_file.project_id is not null and public.can_view_project(v_file.project_id))
     or (v_file.client_id is not null and public.can_view_client(v_file.client_id))
     or (v_file.meeting_id is not null and public.can_view_meeting(v_file.meeting_id))
     or (v_file.ticket_id is not null and public.can_view_ticket(v_file.ticket_id)) then
    return true;
  end if;

  if v_scope = 'department' and v_department is not null and v_file.department_id = v_department then
    return true;
  end if;

  return exists (
    select 1 from public.messages m
    where m.file_id = v_file.id and m.deleted_at is null and public.can_view_conversation(m.conversation_id)
  );
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.employee_has_private_record(uuid) to authenticated;
grant execute on function public.can_see_employee_record(uuid) to authenticated;
grant execute on function public.get_hidden_employee_ids() to authenticated;
grant execute on function public.role_within_own_access(uuid) to authenticated;
grant execute on function public.role_is_assignable(uuid) to authenticated;
grant execute on function public.set_employee_extra_roles(uuid, uuid[]) to authenticated;
grant execute on function public.change_employee_login_email(uuid, text) to authenticated;
grant execute on function public.can_see_personal_details(uuid) to authenticated;
grant execute on function public.record_private_detail_reveal(uuid, text) to authenticated;
grant execute on function public.employee_tracks_attendance(uuid) to authenticated;
grant execute on function public.get_attendance_report_data(date, date) to authenticated;
grant execute on function public.can_view_file_row(public.files) to authenticated;
