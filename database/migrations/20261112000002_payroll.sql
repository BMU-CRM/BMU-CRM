-- Stage 4 of the HR and Finance build: payroll.
--
-- * Salary components and payroll rules (PF, ESI, professional tax slabs by state, TDS),
--   each rule with an effective-from date. No statutory rate is written here: HR enters
--   them, and payroll warns about anything not set up.
-- * A salary structure per employee from an effective date. Each new structure records
--   a salary revision. Appraisals.
-- * Monthly payroll runs. HR prepares a run (draft), sends it for review, and the Finance
--   Head approves it (or sends it back) and marks it paid. Every figure on a payslip is
--   worked out here, in the database, never typed in: paid days come from attendance
--   and leave, then pay is prorated and deductions applied.
-- * Payslips are seen by the employee once the run is paid.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('payroll.manage', 'Payroll', 'Prepare payroll',
   'Set salary components, payroll rules and salary structures, prepare payroll runs and record appraisals.', '{organisation}', 1200),
  ('payroll.approve', 'Payroll', 'Approve and pay payroll',
   'Approve payroll runs prepared by HR, send them back, and mark them paid.', '{organisation}', 1210),
  ('payslips.view', 'Payroll', 'See my payslips', 'See your own payslips once salary is paid.', '{own}', 1220);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.key in ('payroll.manage', 'payroll.approve', 'payslips.view')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'payroll.manage', 'organisation' from public.roles r where lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'payroll.approve', 'organisation' from public.roles r where r.name = 'Finance Head'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Everyone sees their own payslips.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'payslips.view', 'own' from public.roles r
on conflict (role_id, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Settings, components and rules
-- ---------------------------------------------------------------------------

alter table public.company_settings
  -- The state whose professional tax applies when a salary structure does not name one.
  add column default_pt_state text check (length(trim(default_pt_state)) between 2 and 60),
  -- Whether working days without attendance or leave reduce pay.
  add column payroll_absence_lop boolean not null default true;

create table public.salary_components (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  kind text not null check (kind in ('earning', 'deduction')),
  calculation text not null check (calculation in ('fixed', 'percentage')),
  amount numeric(14, 2) check (amount >= 0),
  percentage numeric(6, 3) check (percentage > 0 and percentage <= 100),
  percentage_of text check (percentage_of in ('basic', 'gross')),
  is_taxable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_components_shape check (
    (calculation = 'fixed' and amount is not null and percentage is null and percentage_of is null)
    or (calculation = 'percentage' and percentage is not null and percentage_of is not null and amount is null)
  )
);
create unique index salary_components_name_unique on public.salary_components (lower(name));

create type public.payroll_rule_kind as enum ('pf', 'esi', 'pt', 'tds');

-- PF: employee and employer rate on basic pay, counted up to the wage limit each month.
-- ESI: employee and employer rate on gross pay, for people whose monthly gross is at or
--      below the wage limit.
-- Professional tax: monthly slabs on gross pay, for one state.
-- TDS: a rate on yearly taxable pay above the wage limit, spread over twelve months.
create table public.payroll_rules (
  id uuid primary key default gen_random_uuid(),
  kind public.payroll_rule_kind not null,
  effective_from date not null,
  state text check (length(trim(state)) between 2 and 60),
  employee_rate numeric(6, 3) check (employee_rate between 0 and 100),
  employer_rate numeric(6, 3) check (employer_rate between 0 and 100),
  wage_limit numeric(14, 2) check (wage_limit >= 0),
  -- Professional tax: [{"from": 0, "to": 15000, "amount": 0}, ...]; an empty "to" has no top.
  slabs jsonb,
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_rules_shape check (
    (kind = 'pt' and state is not null and jsonb_typeof(slabs) = 'array')
    or (kind in ('pf', 'esi') and employee_rate is not null and employer_rate is not null and state is null and slabs is null)
    or (kind = 'tds' and employee_rate is not null and state is null and slabs is null)
  )
);
create unique index payroll_rules_unique on public.payroll_rules (kind, lower(coalesce(state, '')), effective_from);

-- The rule in force on a date.
create function public.payroll_rule_on(p_kind public.payroll_rule_kind, p_on date, p_state text default null)
returns public.payroll_rules
language sql stable security definer set search_path = ''
as $$
  select r.* from public.payroll_rules r
  where r.kind = p_kind and r.effective_from <= p_on
    and (p_kind <> 'pt' or lower(r.state) = lower(trim(p_state)))
  order by r.effective_from desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Salary structures, revisions and appraisals
-- ---------------------------------------------------------------------------

-- Monthly amounts. A new structure from a later date is a salary revision; the older
-- ones are kept as history.
create table public.salary_structures (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  effective_from date not null,
  basic numeric(14, 2) not null check (basic > 0),
  hra numeric(14, 2) not null default 0 check (hra >= 0),
  other_allowances numeric(14, 2) not null default 0 check (other_allowances >= 0),
  special_allowance numeric(14, 2) not null default 0 check (special_allowance >= 0),
  incentive numeric(14, 2) not null default 0 check (incentive >= 0),
  bonus numeric(14, 2) not null default 0 check (bonus >= 0),
  gross numeric(14, 2) generated always as (basic + hra + other_allowances + special_allowance + incentive + bonus) stored,
  pf_applies boolean not null default true,
  esi_applies boolean not null default true,
  -- Empty means the company's default state.
  pt_state text check (length(trim(pt_state)) between 2 and 60),
  -- A fixed monthly TDS, used instead of the TDS rule when set.
  tds_monthly numeric(14, 2) check (tds_monthly >= 0),
  revision_reason text check (length(revision_reason) <= 500),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from)
);

create table public.salary_revisions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  structure_id uuid not null references public.salary_structures (id) on delete cascade,
  effective_from date not null,
  previous_gross numeric(14, 2) not null,
  revised_gross numeric(14, 2) not null,
  change_percent numeric(8, 2),
  reason text,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index salary_revisions_employee_idx on public.salary_revisions (employee_id, effective_from desc);

create table public.appraisals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  period_label text not null check (length(trim(period_label)) between 2 and 60),
  period_start date not null,
  period_end date not null,
  rating numeric(2, 1) not null check (rating between 1 and 5),
  notes text check (length(notes) <= 4000),
  reviewer_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appraisals_period check (period_end >= period_start)
);
create index appraisals_employee_idx on public.appraisals (employee_id, period_end desc);

create function public.stamp_salary_structure()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := public.current_employee_id();
  end if;
  return new;
end;
$$;

-- A structure that follows an earlier one records the change as a revision.
create function public.record_salary_revision()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous numeric;
begin
  select s.gross into v_previous from public.salary_structures s
  where s.employee_id = new.employee_id and s.effective_from < new.effective_from
  order by s.effective_from desc limit 1;

  if v_previous is not null then
    insert into public.salary_revisions
      (employee_id, structure_id, effective_from, previous_gross, revised_gross, change_percent, reason, created_by)
    values (new.employee_id, new.id, new.effective_from, v_previous, new.gross,
            case when v_previous > 0 then round((new.gross - v_previous) / v_previous * 100, 2) end,
            new.revision_reason, new.created_by);
  end if;
  return null;
end;
$$;

create trigger salary_structures_stamp before insert on public.salary_structures
  for each row execute function public.stamp_salary_structure();
create trigger salary_structures_revision after insert on public.salary_structures
  for each row execute function public.record_salary_revision();

create function public.stamp_appraisal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and tg_op = 'INSERT' then
    new.reviewer_id := public.current_employee_id();
  end if;
  return new;
end;
$$;

create trigger appraisals_stamp before insert on public.appraisals
  for each row execute function public.stamp_appraisal();

-- ---------------------------------------------------------------------------
-- Statutory deductions
-- ---------------------------------------------------------------------------

-- PF, ESI, professional tax and TDS for one month's pay, from the rules in force on
-- p_on. Anything not set up comes back as zero with a warning.
create function public.calculate_statutory(
  p_basic numeric, p_gross numeric, p_full_gross numeric, p_taxable numeric,
  p_pf_applies boolean, p_esi_applies boolean, p_pt_state text, p_tds_monthly numeric, p_on date,
  out pf_employee numeric, out pf_employer numeric, out esi_employee numeric, out esi_employer numeric,
  out professional_tax numeric, out tds numeric, out warnings text[]
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rule public.payroll_rules;
  v_base numeric;
  v_slab jsonb;
begin
  pf_employee := 0; pf_employer := 0; esi_employee := 0; esi_employer := 0; professional_tax := 0; tds := 0;
  warnings := '{}';

  if p_pf_applies then
    v_rule := public.payroll_rule_on('pf', p_on);
    if v_rule.id is null then
      warnings := array_append(warnings, 'PF is not set up');
    else
      v_base := case when v_rule.wage_limit is null then p_basic else least(p_basic, v_rule.wage_limit) end;
      pf_employee := round(v_base * v_rule.employee_rate / 100, 0);
      pf_employer := round(v_base * v_rule.employer_rate / 100, 0);
    end if;
  end if;

  if p_esi_applies then
    v_rule := public.payroll_rule_on('esi', p_on);
    if v_rule.id is null then
      warnings := array_append(warnings, 'ESI is not set up');
    elsif v_rule.wage_limit is null or p_full_gross <= v_rule.wage_limit then
      esi_employee := ceil(p_gross * v_rule.employee_rate / 100);
      esi_employer := ceil(p_gross * v_rule.employer_rate / 100);
    end if;
  end if;

  if p_pt_state is not null then
    v_rule := public.payroll_rule_on('pt', p_on, p_pt_state);
    if v_rule.id is null then
      warnings := array_append(warnings, 'Professional tax is not set up for ' || p_pt_state);
    else
      select s into v_slab from jsonb_array_elements(v_rule.slabs) s
      where p_gross >= (s ->> 'from')::numeric and (s ->> 'to' is null or p_gross <= (s ->> 'to')::numeric)
      order by (s ->> 'from')::numeric desc limit 1;
      professional_tax := coalesce((v_slab ->> 'amount')::numeric, 0);
    end if;
  end if;

  if p_tds_monthly is not null then
    tds := p_tds_monthly;
  else
    v_rule := public.payroll_rule_on('tds', p_on);
    if v_rule.id is null then
      warnings := array_append(warnings, 'TDS is not set up');
    else
      tds := round(greatest(p_taxable * 12 - coalesce(v_rule.wage_limit, 0), 0) * v_rule.employee_rate / 100 / 12, 0);
    end if;
  end if;
end;
$$;

-- Monthly cost to the company of a structure: gross plus employer PF and ESI.
create function public.get_salary_structure_costs(p_employee uuid)
returns table (
  structure_id uuid, effective_from date, gross numeric, employer_pf numeric, employer_esi numeric,
  monthly_ctc numeric, annual_ctc numeric, warnings text[]
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_default_state text;
begin
  if not (p_employee = public.current_employee_id()
          or public.has_permission('payroll.manage') or public.has_permission('payroll.approve')) then
    raise exception 'You do not have permission to see this salary.' using errcode = 'insufficient_privilege';
  end if;
  select default_pt_state into v_default_state from public.company_settings;

  return query
  select s.id, s.effective_from, s.gross, c.pf_employer, c.esi_employer,
         s.gross + c.pf_employer + c.esi_employer, (s.gross + c.pf_employer + c.esi_employer) * 12, c.warnings
  from public.salary_structures s
  cross join lateral public.calculate_statutory(
    s.basic, s.gross, s.gross, s.gross, s.pf_applies, s.esi_applies, coalesce(s.pt_state, v_default_state),
    s.tds_monthly, greatest(s.effective_from, public.india_today())
  ) c
  where s.employee_id = p_employee
  order by s.effective_from desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payroll runs and lines
-- ---------------------------------------------------------------------------

create type public.payroll_run_status as enum ('draft', 'in_review', 'approved', 'paid');

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  status public.payroll_run_status not null default 'draft',
  employee_count integer not null default 0,
  total_gross numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  total_employer_cost numeric(14, 2) not null default 0,
  prepared_by uuid references public.employees (id) on delete set null,
  submitted_at timestamptz,
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  review_note text check (length(review_note) <= 1000),
  paid_on date,
  payment_method public.payment_method,
  payment_reference text check (length(payment_reference) <= 120),
  paid_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_runs_paid check (status <> 'paid' or (paid_on is not null and payment_method is not null))
);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  structure_id uuid references public.salary_structures (id) on delete restrict,
  days_in_month integer not null default 0,
  -- Days the person was employed in the month.
  payable_days numeric(5, 2) not null default 0,
  absent_days numeric(5, 2) not null default 0,
  unpaid_leave_days numeric(5, 2) not null default 0,
  -- HR's own change to loss of pay, in days. Can be negative.
  lop_adjustment numeric(5, 2) not null default 0 check (lop_adjustment between -31 and 31),
  lop_days numeric(5, 2) not null default 0,
  paid_days numeric(5, 2) not null default 0,
  overtime_hours numeric(6, 2) not null default 0,
  basic numeric(14, 2) not null default 0,
  hra numeric(14, 2) not null default 0,
  other_allowances numeric(14, 2) not null default 0,
  special_allowance numeric(14, 2) not null default 0,
  incentive numeric(14, 2) not null default 0 check (incentive >= 0),
  bonus numeric(14, 2) not null default 0 check (bonus >= 0),
  overtime_amount numeric(14, 2) not null default 0 check (overtime_amount >= 0),
  other_earnings numeric(14, 2) not null default 0 check (other_earnings >= 0),
  components jsonb not null default '[]',
  component_earnings numeric(14, 2) not null default 0,
  component_deductions numeric(14, 2) not null default 0,
  gross_earnings numeric(14, 2) not null default 0,
  pf_employee numeric(14, 2) not null default 0,
  pf_employer numeric(14, 2) not null default 0,
  esi_employee numeric(14, 2) not null default 0,
  esi_employer numeric(14, 2) not null default 0,
  professional_tax numeric(14, 2) not null default 0,
  tds numeric(14, 2) not null default 0,
  other_deductions numeric(14, 2) not null default 0 check (other_deductions >= 0),
  total_deductions numeric(14, 2) not null default 0,
  net_pay numeric(14, 2) not null default 0,
  notes text check (length(notes) <= 1000),
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index payroll_lines_employee_idx on public.payroll_lines (employee_id);

-- The person's last day with the company in a month, if they are leaving. Exit
-- management fills this in; until then nobody has one.
create function public.employee_last_day(p_employee uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select null::date
$$;

-- Works out one payslip from the salary structure, attendance, leave and the rules.
create function public.calculate_payroll_line(p_line uuid)
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

      if v_settings.payroll_absence_lop then
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

create function public.refresh_payroll_run_totals(p_run uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.payroll_runs r set
    employee_count = t.people,
    total_gross = t.gross,
    total_deductions = t.deductions,
    total_net = t.net,
    total_employer_cost = t.gross + t.employer,
    updated_at = now()
  from (
    select count(*) as people, coalesce(sum(gross_earnings), 0) as gross, coalesce(sum(total_deductions), 0) as deductions,
           coalesce(sum(net_pay), 0) as net, coalesce(sum(pf_employer + esi_employer), 0) as employer
    from public.payroll_lines where run_id = p_run
  ) t
  where r.id = p_run
$$;

create function public.require_payroll_permission(p_permission text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission(p_permission) then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Adds everyone due a salary that month who is not on the run yet, then works out
-- every line again. Only while the run is a draft.
create function public.recalculate_payroll_run(p_run uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.payroll_runs;
  v_end date;
  v_line uuid;
begin
  perform public.require_payroll_permission('payroll.manage');
  select * into v_run from public.payroll_runs where id = p_run for update;
  if v_run.id is null then
    raise exception 'This payroll run could not be found.' using errcode = 'no_data_found';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Only a draft payroll run can be changed.' using errcode = 'check_violation';
  end if;
  v_end := (v_run.month + interval '1 month' - interval '1 day')::date;

  insert into public.payroll_lines (run_id, employee_id, incentive, bonus)
  select p_run, e.id, s.incentive, s.bonus
  from public.employees e
  cross join lateral (
    select * from public.salary_structures s
    where s.employee_id = e.id and s.effective_from <= v_end
    order by s.effective_from desc limit 1
  ) s
  where e.is_active and (e.joining_date is null or e.joining_date <= v_end)
    -- Leavers are paid up to their last day, and left off months after it.
    and coalesce(public.employee_last_day(e.id), v_end) >= v_run.month
  on conflict (run_id, employee_id) do nothing;

  for v_line in select id from public.payroll_lines where run_id = p_run loop
    perform public.calculate_payroll_line(v_line);
  end loop;
  perform public.refresh_payroll_run_totals(p_run);
end;
$$;

create function public.start_payroll_run(p_month date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_run uuid;
  v_month date := date_trunc('month', p_month)::date;
begin
  perform public.require_payroll_permission('payroll.manage');
  if exists (select 1 from public.payroll_runs where month = v_month) then
    raise exception 'There is already a payroll run for this month.' using errcode = 'unique_violation';
  end if;
  insert into public.payroll_runs (month, prepared_by) values (v_month, public.current_employee_id())
  returning id into v_run;
  perform public.recalculate_payroll_run(v_run);
  return v_run;
end;
$$;

-- HR's changes to one payslip: variable pay, extra deductions and loss of pay days.
create function public.save_payroll_line(
  p_line uuid, p_incentive numeric, p_bonus numeric, p_overtime_amount numeric, p_other_earnings numeric,
  p_other_deductions numeric, p_lop_adjustment numeric, p_notes text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run uuid;
begin
  perform public.require_payroll_permission('payroll.manage');
  select l.run_id into v_run from public.payroll_lines l
  join public.payroll_runs r on r.id = l.run_id and r.status = 'draft'
  where l.id = p_line;
  if v_run is null then
    raise exception 'Only lines on a draft payroll run can be changed.' using errcode = 'check_violation';
  end if;

  update public.payroll_lines set
    incentive = p_incentive, bonus = p_bonus, overtime_amount = p_overtime_amount, other_earnings = p_other_earnings,
    other_deductions = p_other_deductions, lop_adjustment = p_lop_adjustment, notes = nullif(trim(p_notes), '')
  where id = p_line;
  perform public.calculate_payroll_line(p_line);
  perform public.refresh_payroll_run_totals(v_run);
end;
$$;

create function public.payroll_month_label(p_month date)
returns text
language sql immutable set search_path = ''
as $$
  select trim(to_char(p_month, 'FMMonth YYYY'))
$$;

create function public.submit_payroll_run(p_run uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.payroll_runs;
  v_person uuid;
begin
  perform public.require_payroll_permission('payroll.manage');
  perform public.recalculate_payroll_run(p_run);
  select * into v_run from public.payroll_runs where id = p_run;
  if v_run.employee_count = 0 then
    raise exception 'There is nobody on this payroll run.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.payroll_lines where run_id = p_run and net_pay < 0) then
    raise exception 'A payslip has negative net pay. Correct it first.' using errcode = 'check_violation';
  end if;

  update public.payroll_runs set status = 'in_review', submitted_at = now(), review_note = null where id = p_run;

  for v_person in select id from public.employees_with_permission('payroll.approve', 'organisation') as a (id) loop
    perform public.notify(v_person, 'payroll_review', 'Payroll is waiting for your approval',
      public.payroll_month_label(v_run.month) || ': ' || v_run.employee_count || ' people, '
        || public.format_rupees(v_run.total_net) || ' net', '/hr/payroll/' || p_run, 'high');
  end loop;
end;
$$;

-- The Finance Head approves a run, or sends it back to HR with a note.
create function public.decide_payroll_run(p_run uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.payroll_runs;
begin
  perform public.require_payroll_permission('payroll.approve');
  select * into v_run from public.payroll_runs where id = p_run for update;
  if v_run.status is distinct from 'in_review' then
    raise exception 'This payroll run is not waiting for approval.' using errcode = 'check_violation';
  end if;
  -- The same person may prepare and approve: the company's HR and Finance Head can be one
  -- person working in two roles. The approval is still a separate, recorded step.
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Say what needs to change.' using errcode = 'check_violation';
  end if;

  update public.payroll_runs set
    status = case when p_approve then 'approved' else 'draft' end::public.payroll_run_status,
    decided_by = public.current_employee_id(), decided_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_run;

  perform public.notify(v_run.prepared_by, 'payroll_decided',
    case when p_approve then 'Payroll was approved' else 'Payroll was sent back' end,
    public.payroll_month_label(v_run.month) || coalesce(': ' || nullif(trim(p_note), ''), ''), '/hr/payroll/' || p_run,
    case when p_approve then 'normal' else 'high' end::public.notification_priority);
end;
$$;

create function public.mark_payroll_paid(p_run uuid, p_paid_on date, p_method public.payment_method, p_reference text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.payroll_runs;
  v_person uuid;
begin
  perform public.require_payroll_permission('payroll.approve');
  select * into v_run from public.payroll_runs where id = p_run for update;
  if v_run.status is distinct from 'approved' then
    raise exception 'Only an approved payroll run can be marked paid.' using errcode = 'check_violation';
  end if;
  if p_paid_on is null or p_paid_on > public.india_today() then
    raise exception 'Enter the date the salaries were paid.' using errcode = 'check_violation';
  end if;

  update public.payroll_runs set status = 'paid', paid_on = p_paid_on, payment_method = p_method,
    payment_reference = nullif(trim(p_reference), ''), paid_by = public.current_employee_id()
  where id = p_run;

  for v_person in select employee_id from public.payroll_lines where run_id = p_run loop
    perform public.notify(v_person, 'salary_paid', 'Your payslip is ready',
      'Salary for ' || public.payroll_month_label(v_run.month) || ' is paid.', '/payslips');
  end loop;
  perform public.notify(v_run.prepared_by, 'salary_paid', 'Payroll was paid',
    public.payroll_month_label(v_run.month), '/hr/payroll/' || p_run);
end;
$$;

-- A draft run can be thrown away and started again.
create function public.discard_payroll_run(p_run uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_payroll_permission('payroll.manage');
  delete from public.payroll_runs where id = p_run and status = 'draft';
  if not found then
    raise exception 'Only a draft payroll run can be discarded.' using errcode = 'check_violation';
  end if;
end;
$$;

-- The company name and address for payslips and letters, which everyone may print.
create function public.get_company_profile()
returns table (legal_name text, address text, state text, email text, phone text)
language sql stable security definer set search_path = ''
as $$
  select s.legal_name, s.address, s.state, s.email, s.phone
  from public.finance_settings s
  where public.current_employee_id() is not null
$$;

-- ---------------------------------------------------------------------------
-- Employment history now includes salary revisions, for the person and payroll only.
-- ---------------------------------------------------------------------------

create or replace function public.get_employment_history(p_employee uuid)
returns table (changed_at timestamptz, actor_name text, field text, old_value text, new_value text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_see_personal_details(p_employee) then
    raise exception 'You do not have permission to see this history.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select l.created_at, l.actor_name, c.key,
         public.employee_history_value(c.key, c.value -> 'from' #>> '{}'),
         public.employee_history_value(c.key, c.value -> 'to' #>> '{}')
  from public.audit_logs l
  cross join lateral jsonb_each(l.details -> 'changes') c
  where l.entity_type = 'employees' and l.entity_id = p_employee::text and l.action = 'updated'
    and c.key in (
      'designation_id', 'department_id', 'reporting_manager_id', 'role_id', 'employment_status',
      'employment_type_id', 'joining_date', 'probation_months', 'confirmation_date', 'is_active'
    )
  union all
  select l.created_at, l.actor_name, 'created', null, null
  from public.audit_logs l
  where l.entity_type = 'employees' and l.entity_id = p_employee::text and l.action = 'created'
  union all
  select r.effective_from::timestamptz, coalesce(e.full_name, 'System'), 'salary',
         public.format_rupees(r.previous_gross), public.format_rupees(r.revised_gross)
           || coalesce(' (' || case when r.change_percent >= 0 then '+' else '' end || trim_scale(r.change_percent) || '%)', '')
  from public.salary_revisions r
  left join public.employees e on e.id = r.created_by
  where r.employee_id = p_employee
    and (p_employee = public.current_employee_id() or public.has_permission('payroll.manage'))
  order by 1 desc, 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger salary_components_set_updated_at before update on public.salary_components
  for each row execute function public.set_updated_at();
create trigger payroll_rules_set_updated_at before update on public.payroll_rules
  for each row execute function public.set_updated_at();
create trigger appraisals_set_updated_at before update on public.appraisals
  for each row execute function public.set_updated_at();

create trigger salary_components_audit after insert or update or delete on public.salary_components
  for each row execute function public.audit_row_change();
create trigger payroll_rules_audit after insert or update or delete on public.payroll_rules
  for each row execute function public.audit_row_change();
create trigger salary_structures_audit after insert or delete on public.salary_structures
  for each row execute function public.audit_row_change();
create trigger appraisals_audit after insert or update or delete on public.appraisals
  for each row execute function public.audit_row_change();
create trigger payroll_runs_audit after insert or update of status or delete on public.payroll_runs
  for each row execute function public.audit_row_change();
create trigger payroll_lines_audit after update of incentive, bonus, overtime_amount, other_earnings, other_deductions, lop_adjustment
  on public.payroll_lines
  for each row execute function public.audit_row_change();

alter table public.salary_components enable row level security;
alter table public.payroll_rules enable row level security;
alter table public.salary_structures enable row level security;
alter table public.salary_revisions enable row level security;
alter table public.appraisals enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_lines enable row level security;

create function public.can_see_payroll()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('payroll.manage') or public.has_permission('payroll.approve')
$$;

create policy salary_components_select on public.salary_components for select to authenticated
  using (public.can_see_payroll());
create policy salary_components_write on public.salary_components for all to authenticated
  using (public.has_permission('payroll.manage')) with check (public.has_permission('payroll.manage'));

create policy payroll_rules_select on public.payroll_rules for select to authenticated
  using (public.can_see_payroll());
create policy payroll_rules_write on public.payroll_rules for all to authenticated
  using (public.has_permission('payroll.manage')) with check (public.has_permission('payroll.manage'));

-- Structures are added, never edited: a change is a new structure from a new date.
create policy salary_structures_select on public.salary_structures for select to authenticated
  using (employee_id = public.current_employee_id() or public.can_see_payroll());
create policy salary_structures_insert on public.salary_structures for insert to authenticated
  with check (public.has_permission('payroll.manage'));
create policy salary_structures_delete on public.salary_structures for delete to authenticated
  using (public.has_permission('payroll.manage'));

create policy salary_revisions_select on public.salary_revisions for select to authenticated
  using (employee_id = public.current_employee_id() or public.can_see_payroll());

create policy appraisals_select on public.appraisals for select to authenticated
  using (employee_id = public.current_employee_id() or public.has_permission('payroll.manage'));
create policy appraisals_write on public.appraisals for all to authenticated
  using (public.has_permission('payroll.manage')) with check (public.has_permission('payroll.manage'));

-- Whether the signed-in person has a payslip on a paid run. Read without row level
-- security, so the two policies below do not depend on each other.
create function public.has_paid_payslip_in(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payroll_lines l
    join public.payroll_runs r on r.id = l.run_id and r.status = 'paid'
    where l.run_id = p_run and l.employee_id = public.current_employee_id()
  ) and public.has_permission('payslips.view')
$$;

-- Runs and lines change only through the functions above.
create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (public.can_see_payroll() or public.has_paid_payslip_in(id));
create policy payroll_lines_select on public.payroll_lines for select to authenticated
  using (public.can_see_payroll() or (employee_id = public.current_employee_id() and public.has_paid_payslip_in(run_id)));

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.salary_components to authenticated;
grant select, insert, update, delete on public.payroll_rules to authenticated;
grant select, insert, delete on public.salary_structures to authenticated;
grant select on public.salary_revisions to authenticated;
grant select, insert, update, delete on public.appraisals to authenticated;
grant select on public.payroll_runs to authenticated;
grant select on public.payroll_lines to authenticated;

grant execute on function public.can_see_payroll() to authenticated;
grant execute on function public.has_paid_payslip_in(uuid) to authenticated;
grant execute on function public.get_salary_structure_costs(uuid) to authenticated;
grant execute on function public.start_payroll_run(date) to authenticated;
grant execute on function public.recalculate_payroll_run(uuid) to authenticated;
grant execute on function public.save_payroll_line(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.submit_payroll_run(uuid) to authenticated;
grant execute on function public.decide_payroll_run(uuid, boolean, text) to authenticated;
grant execute on function public.mark_payroll_paid(uuid, date, public.payment_method, text) to authenticated;
grant execute on function public.discard_payroll_run(uuid) to authenticated;
grant execute on function public.get_company_profile() to authenticated;
grant execute on function public.get_employment_history(uuid) to authenticated;
grant execute on function public.payroll_month_label(date) to authenticated;
