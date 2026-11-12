-- Stage 6 of the HR and Finance build: resignation and exit.
--
-- * Employees resign from their own page. HR approves (setting the last working day,
--   from the notice period in HR settings when there is one) or rejects. The person can
--   withdraw until HR decides. Approval puts them on notice.
-- * An exit checklist from configurable items, the exit interview, and open tasks.
-- * Full and final settlement: HR prepares it from suggested figures (pending salary,
--   leave encashment, notice recovery); Finance marks it paid. The total is worked out
--   here, never typed in.
-- * After the last working day a nightly job marks the person exited, removes their
--   access and blocks their sign-in, the same as deactivating them by hand. Their
--   history is kept.

-- ---------------------------------------------------------------------------
-- Permissions and settings
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('exits.manage', 'Exits', 'Handle resignations and exits',
   'Approve or reject resignations, run exit checklists and prepare full and final settlements.', '{organisation}', 1400),
  ('resignation.submit', 'Exits', 'Resign', 'Submit your own resignation.', '{own}', 1410);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'exits.manage', 'organisation'
from public.roles r
where r.name = 'Founder' or lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Everyone can resign. The Founder has it too, as every new permission must be, or the
-- Founder could no longer manage people whose role includes it.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'resignation.submit', 'own' from public.roles r
on conflict (role_id, permission_key) do nothing;

-- Empty until HR sets it, as the owner asked.
alter table public.company_settings
  add column notice_period_days integer check (notice_period_days between 0 and 180);

-- ---------------------------------------------------------------------------
-- Resignations
-- ---------------------------------------------------------------------------

create type public.resignation_status as enum ('submitted', 'approved', 'rejected', 'withdrawn', 'completed');

create table public.resignations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  reason text not null check (length(trim(reason)) between 3 and 4000),
  submitted_on date not null default public.india_today(),
  proposed_last_day date,
  status public.resignation_status not null default 'submitted',
  -- The notice period in force when they resigned.
  notice_days integer,
  last_working_day date,
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 1000),
  exit_interview_at timestamptz,
  exit_interview_notes text check (length(exit_interview_notes) <= 4000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resignations_employee_idx on public.resignations (employee_id);
create index resignations_status_idx on public.resignations (status, last_working_day);

create table public.exit_checklist_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null default 'other' check (category in ('knowledge_transfer', 'asset', 'clearance', 'other')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index exit_checklist_items_name_unique on public.exit_checklist_items (lower(name));

insert into public.exit_checklist_items (name, category, sort_order) values
  ('Knowledge transfer completed', 'knowledge_transfer', 10),
  ('Laptop returned', 'asset', 20),
  ('ID card returned', 'asset', 30),
  ('Department clearance', 'clearance', 40),
  ('Finance clearance', 'clearance', 50),
  ('No objection certificate issued', 'clearance', 60);

create table public.exit_tasks (
  id uuid primary key default gen_random_uuid(),
  resignation_id uuid not null references public.resignations (id) on delete cascade,
  item_name text not null,
  category text not null default 'other',
  sort_order integer not null default 0,
  done_at timestamptz,
  done_by uuid references public.employees (id) on delete set null,
  note text check (length(note) <= 500),
  unique (resignation_id, item_name)
);

create table public.final_settlements (
  resignation_id uuid primary key references public.resignations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  pending_salary numeric(14, 2) not null default 0 check (pending_salary >= 0),
  leave_encashment_days numeric(5, 1) not null default 0 check (leave_encashment_days >= 0),
  leave_encashment_amount numeric(14, 2) not null default 0 check (leave_encashment_amount >= 0),
  reimbursements_due numeric(14, 2) not null default 0 check (reimbursements_due >= 0),
  other_earnings numeric(14, 2) not null default 0 check (other_earnings >= 0),
  notice_recovery numeric(14, 2) not null default 0 check (notice_recovery >= 0),
  other_deductions numeric(14, 2) not null default 0 check (other_deductions >= 0),
  final_amount numeric(14, 2) generated always as (
    pending_salary + leave_encashment_amount + reimbursements_due + other_earnings - notice_recovery - other_deductions
  ) stored,
  notes text check (length(notes) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'paid')),
  paid_on date,
  payment_method public.payment_method,
  payment_reference text check (length(payment_reference) <= 120),
  paid_by uuid references public.employees (id) on delete set null,
  prepared_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Employee changes made by HR processes
-- ---------------------------------------------------------------------------

-- As before, plus: approved resignations and completed exits change someone's status
-- through a trusted step, whoever's role the person has.
create or replace function public.guard_employee_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_is_self boolean;
  v_update_scope public.permission_scope;
  v_can_manage boolean;
begin
  if (select auth.uid()) is null or current_setting('app.trusted_employee_update', true) = 'on' then
    return new;
  end if;
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;

  v_is_self := old.id = v_actor;
  v_update_scope := public.permission_scope_for('employees.update');
  v_can_manage := public.can_access_employee('employees.update', old.id)
    and public.role_is_assignable(old.role_id)
    and (not v_is_self or v_update_scope = 'organisation');

  if new.auth_user_id is distinct from old.auth_user_id
     or new.employee_code is distinct from old.employee_code
     or new.work_email is distinct from old.work_email
     or new.invite_accepted_at is distinct from old.invite_accepted_at then
    raise exception 'This field cannot be changed here.' using errcode = 'insufficient_privilege';
  end if;

  if not v_can_manage and (
    new.full_name is distinct from old.full_name
    or new.designation_id is distinct from old.designation_id
    or new.department_id is distinct from old.department_id
    or new.reporting_manager_id is distinct from old.reporting_manager_id
    or new.joining_date is distinct from old.joining_date
    or new.employment_status is distinct from old.employment_status
    or new.employment_type_id is distinct from old.employment_type_id
    or new.probation_months is distinct from old.probation_months
    or new.confirmation_date is distinct from old.confirmation_date
  ) then
    raise exception 'You do not have permission to change these employee details.'
      using errcode = 'insufficient_privilege';
  end if;

  if not v_is_self and not v_can_manage and (
    new.phone is distinct from old.phone
    or new.avatar_url is distinct from old.avatar_url
    or new.skills is distinct from old.skills
  ) then
    raise exception 'You do not have permission to change these employee details.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.department_id is distinct from old.department_id
     and v_update_scope <> 'organisation' then
    raise exception 'Transferring between departments needs organisation-wide access.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.reporting_manager_id is distinct from old.reporting_manager_id
     and v_update_scope = 'team'
     and (new.reporting_manager_id is null
          or not (new.reporting_manager_id = v_actor or public.is_in_reporting_line(new.reporting_manager_id, v_actor))) then
    raise exception 'Choose a reporting manager within your team.' using errcode = 'insufficient_privilege';
  end if;

  if new.role_id is distinct from old.role_id then
    if v_is_self then
      raise exception 'You cannot change your own role.' using errcode = 'insufficient_privilege';
    end if;
    if not public.can_access_employee('employees.assign_role', old.id)
       or not public.role_is_assignable(old.role_id)
       or not public.role_is_assignable(new.role_id) then
      raise exception 'You do not have permission to assign this role.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.is_active is distinct from old.is_active then
    if v_is_self then
      raise exception 'You cannot change your own account status.'
        using errcode = 'insufficient_privilege';
    end if;
    if not public.can_access_employee('employees.deactivate', old.id)
       or not public.role_is_assignable(old.role_id) then
      raise exception 'You do not have permission to change this account status.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- Payroll pays a leaver up to their last working day.
create or replace function public.employee_last_day(p_employee uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select r.last_working_day from public.resignations r
  where r.employee_id = p_employee and r.status in ('approved', 'completed')
  order by r.last_working_day desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

create function public.can_handle_exits()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('exits.manage')
$$;

create function public.guard_resignation_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.employee_id := public.current_employee_id();
  if new.employee_id is null or not public.has_permission('resignation.submit') then
    raise exception 'You do not have permission to resign here.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.resignations where employee_id = new.employee_id and status in ('submitted', 'approved')) then
    raise exception 'You already have a resignation in progress.' using errcode = 'check_violation';
  end if;
  if new.proposed_last_day is not null and new.proposed_last_day < public.india_today() then
    raise exception 'The last day you propose cannot be in the past.' using errcode = 'check_violation';
  end if;

  new.submitted_on := public.india_today();
  new.status := 'submitted';
  select notice_period_days into new.notice_days from public.company_settings;
  new.last_working_day := null;
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  new.exit_interview_at := null;
  new.exit_interview_notes := null;
  new.completed_at := null;
  return new;
end;
$$;

-- The person may only withdraw while waiting. HR records the exit interview here; every
-- other change goes through the functions below.
create function public.guard_resignation_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_changed text[];
begin
  if (select auth.uid()) is null or current_setting('app.trusted_resignation', true) = 'on' then
    return new;
  end if;

  select array_agg(n.key) into v_changed
  from jsonb_each(to_jsonb(new)) n
  where n.key <> 'updated_at' and n.value is distinct from to_jsonb(old) -> n.key;

  if v_changed is null then
    return new;
  end if;

  if v_changed <@ array['status'] and old.status = 'submitted' and new.status = 'withdrawn'
     and old.employee_id = public.current_employee_id() then
    return new;
  end if;

  if v_changed <@ array['exit_interview_at', 'exit_interview_notes'] and public.can_handle_exits()
     and old.status in ('approved', 'completed') then
    return new;
  end if;

  raise exception 'This resignation cannot be changed that way.' using errcode = 'insufficient_privilege';
end;
$$;

create trigger resignations_guard_insert before insert on public.resignations
  for each row execute function public.guard_resignation_insert();
create trigger resignations_guard_update before update on public.resignations
  for each row execute function public.guard_resignation_update();

create function public.notify_resignation_events()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  v_name text;
  v_manager uuid;
begin
  select full_name, reporting_manager_id into v_name, v_manager from public.employees where id = new.employee_id;

  if tg_op = 'INSERT' or (new.status = 'withdrawn' and old.status = 'submitted') then
    for v_person in
      select id from public.employees_with_permission('exits.manage', 'organisation') as e (id)
      union select v_manager where v_manager is not null
    loop
      perform public.notify(v_person, 'resignation_submitted',
        case when tg_op = 'INSERT' then v_name || ' resigned' else v_name || ' withdrew their resignation' end,
        left(new.reason, 200), '/hr/exits/' || new.id, case when tg_op = 'INSERT' then 'high' else 'normal' end::public.notification_priority);
    end loop;
  elsif new.status in ('approved', 'rejected') and old.status = 'submitted' then
    perform public.notify(new.employee_id, 'resignation_decided',
      'Your resignation was ' || new.status::text,
      case when new.status = 'approved' then 'Last working day: ' || to_char(new.last_working_day, 'DD Mon YYYY') else '' end
        || coalesce(' (' || new.decision_note || ')', ''),
      '/resignation', 'high');
  end if;
  return null;
end;
$$;

create trigger resignations_notify after insert or update of status on public.resignations
  for each row execute function public.notify_resignation_events();

-- HR approves, setting the last working day, or rejects with a reason.
create function public.decide_resignation(p_resignation uuid, p_approve boolean, p_last_day date, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_resignation public.resignations;
  v_last_day date;
begin
  if not public.can_handle_exits() then
    raise exception 'You do not have permission to decide resignations.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_resignation from public.resignations where id = p_resignation for update;
  if v_resignation.status is distinct from 'submitted' then
    raise exception 'This resignation is not waiting for a decision.' using errcode = 'check_violation';
  end if;
  if v_resignation.employee_id = public.current_employee_id() then
    raise exception 'Someone else must decide your own resignation.' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.trusted_resignation', 'on', true);

  if not p_approve then
    if coalesce(trim(p_note), '') = '' then
      raise exception 'Give a reason for rejecting.' using errcode = 'check_violation';
    end if;
    update public.resignations set status = 'rejected', decided_by = public.current_employee_id(), decided_at = now(),
      decision_note = trim(p_note)
    where id = p_resignation;
    return;
  end if;

  v_last_day := coalesce(
    p_last_day,
    case when v_resignation.notice_days is not null then v_resignation.submitted_on + v_resignation.notice_days end,
    v_resignation.proposed_last_day
  );
  if v_last_day is null then
    raise exception 'Choose the last working day. No notice period is set in HR settings.' using errcode = 'check_violation';
  end if;
  if v_last_day < v_resignation.submitted_on then
    raise exception 'The last working day cannot be before the resignation.' using errcode = 'check_violation';
  end if;

  update public.resignations set status = 'approved', last_working_day = v_last_day,
    decided_by = public.current_employee_id(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_resignation;

  insert into public.exit_tasks (resignation_id, item_name, category, sort_order)
  select p_resignation, name, category, sort_order from public.exit_checklist_items where is_active
  on conflict do nothing;

  insert into public.final_settlements (resignation_id, employee_id, prepared_by)
  values (p_resignation, v_resignation.employee_id, public.current_employee_id())
  on conflict do nothing;

  perform set_config('app.trusted_employee_update', 'on', true);
  update public.employees set employment_status = 'notice_period' where id = v_resignation.employee_id;
  perform set_config('app.trusted_employee_update', 'off', true);
end;
$$;

create function public.set_exit_task(p_task uuid, p_done boolean, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_handle_exits() then
    raise exception 'You do not have permission to update the exit checklist.' using errcode = 'insufficient_privilege';
  end if;
  update public.exit_tasks
  set done_at = case when p_done then coalesce(done_at, now()) end,
      done_by = case when p_done then public.current_employee_id() end,
      note = coalesce(nullif(trim(p_note), ''), note)
  where id = p_task;
end;
$$;

-- What the full and final settlement should probably be, for HR to check and adjust.
--  * Pending salary: the last month's pay for days worked, unless a payroll run for that
--    month already includes the person.
--  * Leave encashment: unused days of encashable leave, at basic pay over 30 days.
--  * Notice recovery: notice days not served, at gross pay over 30 days.
create function public.get_settlement_suggestion(p_resignation uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_resignation public.resignations;
  v_employee public.employees;
  v_structure public.salary_structures;
  v_last date;
  v_month_start date;
  v_month_days integer;
  v_worked integer;
  v_on_payroll boolean;
  v_pending numeric := 0;
  v_encash_days numeric := 0;
  v_per_day_basic numeric := 0;
  v_served integer;
  v_shortfall integer := 0;
  v_recovery numeric := 0;
  v_year integer;
begin
  if not (public.can_handle_exits() or public.has_permission('payroll.approve')) then
    raise exception 'You do not have permission to see this settlement.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_resignation from public.resignations where id = p_resignation;
  if v_resignation.last_working_day is null then
    return null;
  end if;
  select * into v_employee from public.employees where id = v_resignation.employee_id;
  v_last := v_resignation.last_working_day;
  v_year := extract(year from v_last)::integer;

  select * into v_structure from public.salary_structures
  where employee_id = v_employee.id and effective_from <= v_last
  order by effective_from desc limit 1;

  v_month_start := date_trunc('month', v_last)::date;
  v_month_days := extract(day from (v_month_start + interval '1 month' - interval '1 day'))::integer;
  v_worked := v_last - greatest(v_month_start, coalesce(v_employee.joining_date, v_month_start)) + 1;
  v_on_payroll := exists (
    select 1 from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
    where l.employee_id = v_employee.id and r.month = v_month_start
  );

  if v_structure.id is not null then
    if not v_on_payroll and v_worked > 0 then
      v_pending := round(v_structure.gross * v_worked / v_month_days, 2);
    end if;
    v_per_day_basic := round(v_structure.basic / 30, 2);

    select coalesce(sum(greatest(
      t.yearly_allowance + public.leave_carried_in(v_employee.id, t.id, v_year, v_last)
      - coalesce((select sum(r.days) from public.leave_requests r
                  where r.employee_id = v_employee.id and r.leave_type_id = t.id and r.status = 'approved'
                    and extract(year from r.start_date) = v_year), 0), 0)), 0)
      into v_encash_days
    from public.leave_types t
    where t.is_encashable and t.is_active and t.yearly_allowance is not null;

    if v_resignation.notice_days is not null then
      v_served := v_last - v_resignation.submitted_on;
      v_shortfall := greatest(v_resignation.notice_days - v_served, 0);
      v_recovery := round(v_structure.gross * v_shortfall / 30, 2);
    end if;
  end if;

  return jsonb_build_object(
    'hasSalary', v_structure.id is not null,
    'pendingSalary', v_pending,
    'daysWorkedInLastMonth', greatest(v_worked, 0),
    'lastMonthOnPayroll', v_on_payroll,
    'encashableDays', v_encash_days,
    'encashmentPerDay', v_per_day_basic,
    'encashmentAmount', round(v_encash_days * v_per_day_basic, 2),
    'noticeDays', v_resignation.notice_days,
    'shortfallDays', v_shortfall,
    'noticeRecovery', v_recovery
  );
end;
$$;

-- HR changes the figures until Finance pays. Payment goes through mark_settlement_paid.
create function public.guard_settlement_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or current_setting('app.trusted_settlement', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then
    raise exception 'A paid settlement cannot be changed.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select employee_id into new.employee_id from public.resignations where id = new.resignation_id;
  elsif new.employee_id is distinct from old.employee_id or new.resignation_id is distinct from old.resignation_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;
  if new.status <> 'draft' or new.paid_on is not null or new.payment_method is not null or new.paid_by is not null then
    raise exception 'Finance marks a settlement paid.' using errcode = 'insufficient_privilege';
  end if;
  new.prepared_by := public.current_employee_id();
  return new;
end;
$$;

create trigger final_settlements_guard before insert or update on public.final_settlements
  for each row execute function public.guard_settlement_change();

create function public.mark_settlement_paid(p_resignation uuid, p_paid_on date, p_method public.payment_method, p_reference text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_settlement public.final_settlements;
begin
  if not public.has_permission('payroll.approve') then
    raise exception 'You do not have permission to pay settlements.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_settlement from public.final_settlements where resignation_id = p_resignation for update;
  if v_settlement.resignation_id is null or v_settlement.status <> 'draft' then
    raise exception 'This settlement is not waiting for payment.' using errcode = 'check_violation';
  end if;
  if v_settlement.final_amount < 0 then
    raise exception 'The settlement is negative. HR needs to correct it, or recover the amount.' using errcode = 'check_violation';
  end if;
  if p_paid_on is null or p_paid_on > public.india_today() then
    raise exception 'Enter the date it was paid.' using errcode = 'check_violation';
  end if;

  perform set_config('app.trusted_settlement', 'on', true);
  update public.final_settlements set status = 'paid', paid_on = p_paid_on, payment_method = p_method,
    payment_reference = nullif(trim(p_reference), ''), paid_by = public.current_employee_id(), updated_at = now()
  where resignation_id = p_resignation;
  perform set_config('app.trusted_settlement', 'off', true);
end;
$$;

-- Nightly: people whose last working day has passed are marked exited, lose access and
-- cannot sign in, exactly as when deactivated by hand. Their records stay.
create function public.process_exits()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_resignation public.resignations;
  v_auth uuid;
  v_count integer := 0;
begin
  if (select auth.uid()) is not null then
    raise exception 'This runs on its own each night.' using errcode = 'insufficient_privilege';
  end if;

  for v_resignation in
    select * from public.resignations where status = 'approved' and last_working_day < public.india_today()
  loop
    update public.employees set employment_status = 'exited', is_active = false
    where id = v_resignation.employee_id
    returning auth_user_id into v_auth;

    if v_auth is not null then
      update app_auth.users set banned_until = 'infinity', updated_at = now() where id = v_auth;
    end if;

    update public.resignations set status = 'completed', completed_at = now() where id = v_resignation.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 00:30 in India.
select cron.schedule('process-exits', '0 19 * * *', $$select public.process_exits()$$);

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger resignations_set_updated_at before update on public.resignations
  for each row execute function public.set_updated_at();
create trigger final_settlements_set_updated_at before update on public.final_settlements
  for each row execute function public.set_updated_at();

create trigger resignations_audit after insert or update on public.resignations
  for each row execute function public.audit_row_change();
create trigger exit_tasks_audit after update on public.exit_tasks
  for each row execute function public.audit_row_change();
create trigger final_settlements_audit after insert or update on public.final_settlements
  for each row execute function public.audit_row_change();
create trigger exit_checklist_items_audit after insert or update or delete on public.exit_checklist_items
  for each row execute function public.audit_row_change();

alter table public.resignations enable row level security;
alter table public.exit_checklist_items enable row level security;
alter table public.exit_tasks enable row level security;
alter table public.final_settlements enable row level security;

-- The person, HR, Finance (to pay the settlement) and the person's manager.
create function public.can_view_resignation(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and (
    p_employee = public.current_employee_id()
    or public.can_handle_exits()
    or public.has_permission('payroll.approve')
    or exists (select 1 from public.employees e where e.id = p_employee and e.reporting_manager_id = public.current_employee_id())
  )
$$;

create policy resignations_select on public.resignations for select to authenticated
  using (public.can_view_resignation(employee_id));
create policy resignations_insert on public.resignations for insert to authenticated
  with check (public.has_permission('resignation.submit'));
create policy resignations_update on public.resignations for update to authenticated
  using (employee_id = public.current_employee_id() or public.can_handle_exits())
  with check (public.current_employee_id() is not null);

create policy exit_checklist_items_select on public.exit_checklist_items for select to authenticated
  using (public.can_handle_exits());
create policy exit_checklist_items_write on public.exit_checklist_items for all to authenticated
  using (public.can_handle_exits()) with check (public.can_handle_exits());

create policy exit_tasks_select on public.exit_tasks for select to authenticated
  using (public.can_handle_exits() or exists (
    select 1 from public.resignations r where r.id = exit_tasks.resignation_id and r.employee_id = public.current_employee_id()
  ));

create policy final_settlements_select on public.final_settlements for select to authenticated
  using (employee_id = public.current_employee_id() or public.can_handle_exits() or public.has_permission('payroll.approve'));
create policy final_settlements_insert on public.final_settlements for insert to authenticated
  with check (public.can_handle_exits());
create policy final_settlements_update on public.final_settlements for update to authenticated
  using (public.can_handle_exits()) with check (public.can_handle_exits());

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update on public.resignations to authenticated;
grant select, insert, update, delete on public.exit_checklist_items to authenticated;
grant select on public.exit_tasks to authenticated;
grant select, insert, update on public.final_settlements to authenticated;

grant execute on function public.can_handle_exits() to authenticated;
grant execute on function public.can_view_resignation(uuid) to authenticated;
grant execute on function public.decide_resignation(uuid, boolean, date, text) to authenticated;
grant execute on function public.set_exit_task(uuid, boolean, text) to authenticated;
grant execute on function public.get_settlement_suggestion(uuid) to authenticated;
grant execute on function public.mark_settlement_paid(uuid, date, public.payment_method, text) to authenticated;
grant execute on function public.process_exits() to service_role;
