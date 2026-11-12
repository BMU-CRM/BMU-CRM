-- Stage 10 of the HR and Finance build: reimbursements, the approvals record, and
-- linking salaries and reimbursements to Finance.
--
-- * Employees claim reimbursements with a receipt. Their reporting manager, or HR,
--   approves or rejects; Finance pays. Paying files the expense automatically under the
--   claim's category, once.
-- * approval_history: every decision on leave, reimbursements, payroll runs and
--   resignations, with who decided, when and why. Shown on each item.
-- * A leaver's approved but unpaid reimbursements are suggested in their full and final
--   settlement, and are marked paid when the settlement is paid, so they are never paid
--   twice.
-- * Receipts and bills attached to money records can be opened by the people who
--   handle that money.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('reimbursements.submit', 'Finance', 'Claim reimbursements', 'Claim back money you spent for work.', '{own}', 1095),
  ('reimbursements.approve', 'Finance', 'Approve reimbursements',
   'Approve or reject claims from people in your reach. Reporting managers can always decide their team''s claims.',
   '{team,department,organisation}', 1096),
  ('reimbursements.pay', 'Finance', 'Pay reimbursements', 'Pay approved reimbursement claims.', '{organisation}', 1097);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.key in ('reimbursements.submit', 'reimbursements.approve', 'reimbursements.pay')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Everyone can claim.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'reimbursements.submit', 'own' from public.roles r
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'reimbursements.approve', 'organisation' from public.roles r where lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'reimbursements.pay', 'organisation' from public.roles r where r.name = 'Finance Head'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- Reimbursements
-- ---------------------------------------------------------------------------

create type public.reimbursement_status as enum ('submitted', 'approved', 'rejected', 'paid', 'cancelled');

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  category_id uuid not null references public.finance_categories (id) on delete restrict,
  description text not null check (length(trim(description)) between 3 and 1000),
  expense_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  receipt_file_id uuid references public.files (id) on delete set null,
  status public.reimbursement_status not null default 'submitted',
  decided_by uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 1000),
  paid_on date,
  payment_method public.payment_method,
  payment_reference text check (length(payment_reference) <= 120),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  paid_by uuid references public.employees (id) on delete set null,
  -- Paid inside a full and final settlement rather than on its own.
  settled_in_resignation_id uuid references public.resignations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reimbursements_employee_idx on public.reimbursements (employee_id, created_at desc);
create index reimbursements_status_idx on public.reimbursements (status);

-- The reporting manager, or anyone whose reimbursement approval reaches the person.
-- Nobody decides their own claim.
create function public.can_decide_reimbursement(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and p_employee <> public.current_employee_id() and (
    public.can_access_employee('reimbursements.approve', p_employee)
    or exists (select 1 from public.employees e where e.id = p_employee and e.reporting_manager_id = public.current_employee_id())
  )
$$;

create function public.can_view_reimbursement(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and (
    p_employee = public.current_employee_id()
    or public.can_decide_reimbursement(p_employee)
    or public.has_permission('reimbursements.pay')
    or public.can_see_ledger()
  )
$$;

-- Claims are made by the person, for themselves, with their own receipt. Afterwards the
-- claim changes only by cancelling it or through the functions below.
create function public.guard_reimbursement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or current_setting('app.trusted_reimbursement', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.employee_id := public.current_employee_id();
    if new.employee_id is null or not public.has_permission('reimbursements.submit') then
      raise exception 'You do not have permission to claim reimbursements.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from public.finance_categories where id = new.category_id and kind = 'expense' and is_active) then
      raise exception 'Choose a category.' using errcode = 'check_violation';
    end if;
    if new.expense_date > public.india_today() then
      raise exception 'The date spent cannot be in the future.' using errcode = 'check_violation';
    end if;
    if new.receipt_file_id is not null and not public.owns_file(new.receipt_file_id) then
      raise exception 'Attach a receipt you uploaded.' using errcode = 'insufficient_privilege';
    end if;
    new.status := 'submitted';
    new.decided_by := null; new.decided_at := null; new.decision_note := null;
    new.paid_on := null; new.payment_method := null; new.payment_reference := null; new.bank_account_id := null; new.paid_by := null;
    new.settled_in_resignation_id := null;
    return new;
  end if;

  if old.employee_id = public.current_employee_id() and old.status = 'submitted' and new.status = 'cancelled'
     and (to_jsonb(new) - array['status', 'updated_at']) = (to_jsonb(old) - array['status', 'updated_at']) then
    return new;
  end if;
  raise exception 'This claim cannot be changed that way.' using errcode = 'insufficient_privilege';
end;
$$;

create trigger reimbursements_guard before insert or update on public.reimbursements
  for each row execute function public.guard_reimbursement();

-- ---------------------------------------------------------------------------
-- The approvals record
-- ---------------------------------------------------------------------------

create table public.approval_history (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('leave', 'reimbursement', 'payroll_run', 'resignation')),
  item_id uuid not null,
  decision text not null,
  comment text,
  decided_by uuid references public.employees (id) on delete set null,
  decided_by_name text not null default 'System',
  created_at timestamptz not null default now()
);
create index approval_history_item_idx on public.approval_history (item_type, item_id, created_at);

create function public.record_approval(p_type text, p_id uuid, p_decision text, p_comment text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_name text;
begin
  select full_name into v_name from public.employees where id = v_actor;
  insert into public.approval_history (item_type, item_id, decision, comment, decided_by, decided_by_name)
  values (p_type, p_id, p_decision, nullif(trim(p_comment), ''), v_actor, coalesce(v_name, 'System'));
end;
$$;

create function public.record_status_approval()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return null;
  end if;
  if tg_table_name = 'leave_requests' and new.status::text in ('approved', 'rejected', 'cancelled') then
    perform public.record_approval('leave', new.id, new.status::text, new.decision_note);
  elsif tg_table_name = 'payroll_runs' then
    perform public.record_approval('payroll_run', new.id,
      case when new.status = 'draft' then 'sent_back' when new.status = 'in_review' then 'submitted' else new.status::text end,
      case when new.status in ('draft', 'approved') then new.review_note when new.status = 'paid' then new.payment_reference end);
  elsif tg_table_name = 'resignations' and new.status::text in ('approved', 'rejected', 'withdrawn', 'completed') then
    perform public.record_approval('resignation', new.id, new.status::text, new.decision_note);
  elsif tg_table_name = 'reimbursements' and new.status::text in ('approved', 'rejected', 'paid', 'cancelled') then
    perform public.record_approval('reimbursement', new.id, new.status::text,
      case when new.status = 'paid' then coalesce(new.payment_reference, '') else new.decision_note end);
  end if;
  return null;
end;
$$;

create trigger leave_requests_record_approval after update of status on public.leave_requests
  for each row execute function public.record_status_approval();
create trigger payroll_runs_record_approval after update of status on public.payroll_runs
  for each row execute function public.record_status_approval();
create trigger resignations_record_approval after update of status on public.resignations
  for each row execute function public.record_status_approval();
create trigger reimbursements_record_approval after update of status on public.reimbursements
  for each row execute function public.record_status_approval();

-- The decisions on one item, for people who may see that item.
create function public.get_approval_history(p_type text, p_id uuid)
returns table (decision text, comment text, decided_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  v_allowed := case p_type
    when 'leave' then exists (select 1 from public.leave_requests r where r.id = p_id and public.can_view_leave_row(r))
    when 'reimbursement' then exists (select 1 from public.reimbursements r where r.id = p_id and public.can_view_reimbursement(r.employee_id))
    when 'payroll_run' then public.can_see_payroll()
    when 'resignation' then exists (select 1 from public.resignations r where r.id = p_id and public.can_view_resignation(r.employee_id))
    else false
  end;
  if not coalesce(v_allowed, false) then
    raise exception 'You do not have permission to see this history.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select h.decision, h.comment, h.decided_by_name, h.created_at
  from public.approval_history h
  where h.item_type = p_type and h.item_id = p_id
  order by h.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deciding and paying claims
-- ---------------------------------------------------------------------------

create function public.decide_reimbursement(p_claim uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.reimbursements;
  v_person uuid;
  v_summary text;
begin
  select * into v_claim from public.reimbursements where id = p_claim for update;
  if v_claim.id is null or not public.can_decide_reimbursement(v_claim.employee_id) then
    raise exception 'You do not have permission to decide this claim.' using errcode = 'insufficient_privilege';
  end if;
  if v_claim.status <> 'submitted' then
    raise exception 'This claim is not waiting for a decision.' using errcode = 'check_violation';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting.' using errcode = 'check_violation';
  end if;

  perform set_config('app.trusted_reimbursement', 'on', true);
  update public.reimbursements set
    status = case when p_approve then 'approved' else 'rejected' end::public.reimbursement_status,
    decided_by = public.current_employee_id(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_claim;
  perform set_config('app.trusted_reimbursement', 'off', true);

  v_summary := public.format_rupees(v_claim.amount) || ': ' || v_claim.description;
  perform public.notify(v_claim.employee_id, 'reimbursement_decided',
    case when p_approve then 'Your reimbursement was approved' else 'Your reimbursement was rejected' end,
    v_summary || coalesce(' (' || nullif(trim(p_note), '') || ')', ''), '/reimbursements',
    case when p_approve then 'normal' else 'high' end::public.notification_priority);
  if p_approve then
    for v_person in select id from public.employees_with_permission('reimbursements.pay', 'organisation') as f (id) loop
      perform public.notify(v_person, 'reimbursement_decided', 'A reimbursement is ready to pay', v_summary, '/finance/salaries?view=reimbursements');
    end loop;
  end if;
end;
$$;

create function public.pay_reimbursement(p_claim uuid, p_paid_on date, p_method public.payment_method, p_reference text, p_account uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.reimbursements;
  v_name text;
begin
  if not public.has_permission('reimbursements.pay') then
    raise exception 'You do not have permission to pay reimbursements.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_claim from public.reimbursements where id = p_claim for update;
  if v_claim.status is distinct from 'approved' then
    raise exception 'Only an approved claim can be paid.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.final_settlements s where s.employee_id = v_claim.employee_id and s.status = 'draft' and s.reimbursements_due > 0) then
    raise exception 'This claim is included in the person''s full and final settlement and is paid with it.' using errcode = 'check_violation';
  end if;
  if p_paid_on is null or p_paid_on > public.india_today() then
    raise exception 'Enter the date it was paid.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_account and is_active) then
    raise exception 'Choose the account it was paid from.' using errcode = 'check_violation';
  end if;

  perform set_config('app.trusted_reimbursement', 'on', true);
  update public.reimbursements set status = 'paid', paid_on = p_paid_on, payment_method = p_method,
    payment_reference = nullif(trim(p_reference), ''), bank_account_id = p_account, paid_by = public.current_employee_id()
  where id = p_claim;
  perform set_config('app.trusted_reimbursement', 'off', true);

  select full_name into v_name from public.employees where id = v_claim.employee_id;
  perform public.record_source_expense('reimbursement', p_claim, v_claim.category_id, v_claim.amount, p_paid_on, p_method, p_reference, p_account,
    'Reimbursement: ' || v_claim.description, v_name, (select department_id from public.employees where id = v_claim.employee_id), v_claim.receipt_file_id);

  perform public.notify(v_claim.employee_id, 'reimbursement_paid', 'Your reimbursement was paid',
    public.format_rupees(v_claim.amount) || ': ' || v_claim.description, '/reimbursements');
end;
$$;

create function public.notify_reimbursement_submitted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  v_name text;
  v_manager uuid;
begin
  select full_name, reporting_manager_id into v_name, v_manager from public.employees where id = new.employee_id;
  for v_person in
    select id from public.employees_with_permission('reimbursements.approve', 'organisation') as a (id)
    union select v_manager where v_manager is not null
  loop
    perform public.notify(v_person, 'reimbursement_submitted', v_name || ' claimed a reimbursement',
      public.format_rupees(new.amount) || ': ' || new.description, '/approvals?tab=reimbursements');
  end loop;
  return null;
end;
$$;

create trigger reimbursements_notify after insert on public.reimbursements
  for each row execute function public.notify_reimbursement_submitted();

-- ---------------------------------------------------------------------------
-- Settlements include approved claims not yet paid, and pay them.
-- ---------------------------------------------------------------------------

create or replace function public.get_settlement_suggestion(p_resignation uuid)
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
  v_claims numeric := 0;
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

  select coalesce(sum(amount), 0) into v_claims from public.reimbursements where employee_id = v_employee.id and status = 'approved';

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
    'noticeRecovery', v_recovery,
    'reimbursementsDue', v_claims
  );
end;
$$;

drop function public.mark_settlement_paid(uuid, date, public.payment_method, text, uuid);

create function public.mark_settlement_paid(
  p_resignation uuid, p_paid_on date, p_method public.payment_method, p_reference text, p_account uuid default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_settlement public.final_settlements;
  v_name text;
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

  -- Approved claims included in the settlement are paid by it, not separately.
  if v_settlement.reimbursements_due > 0 then
    perform set_config('app.trusted_reimbursement', 'on', true);
    update public.reimbursements set status = 'paid', paid_on = p_paid_on, payment_method = p_method,
      payment_reference = 'Paid in the full and final settlement', bank_account_id = public.account_or_default(p_account),
      paid_by = public.current_employee_id(), settled_in_resignation_id = p_resignation
    where employee_id = v_settlement.employee_id and status = 'approved';
    perform set_config('app.trusted_reimbursement', 'off', true);
  end if;

  select full_name into v_name from public.employees where id = v_settlement.employee_id;
  perform public.record_system_expense('settlement', p_resignation, 'settlements', v_settlement.final_amount, p_paid_on, p_method,
    p_reference, p_account, 'Full and final settlement for ' || coalesce(v_name, 'a former employee'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Files attached to money records
-- ---------------------------------------------------------------------------

-- As before, plus: a receipt on a claim is seen by whoever may see the claim; receipts,
-- documents and bills on ledger entries and vendor bills by Finance.
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
    return v_file.employee_id = v_actor or v_file.owner_id = v_actor or public.can_manage_private_details();
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

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger reimbursements_set_updated_at before update on public.reimbursements
  for each row execute function public.set_updated_at();
create trigger reimbursements_audit after insert or update on public.reimbursements
  for each row execute function public.audit_row_change();

alter table public.reimbursements enable row level security;
alter table public.approval_history enable row level security;

create policy reimbursements_select on public.reimbursements for select to authenticated
  using (public.can_view_reimbursement(employee_id));
create policy reimbursements_insert on public.reimbursements for insert to authenticated
  with check (public.has_permission('reimbursements.submit'));
create policy reimbursements_update on public.reimbursements for update to authenticated
  using (employee_id = public.current_employee_id()) with check (employee_id = public.current_employee_id());

-- Read through get_approval_history only.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update on public.reimbursements to authenticated;

grant execute on function public.can_decide_reimbursement(uuid) to authenticated;
grant execute on function public.can_view_reimbursement(uuid) to authenticated;
grant execute on function public.decide_reimbursement(uuid, boolean, text) to authenticated;
grant execute on function public.pay_reimbursement(uuid, date, public.payment_method, text, uuid) to authenticated;
grant execute on function public.get_approval_history(text, uuid) to authenticated;
grant execute on function public.get_settlement_suggestion(uuid) to authenticated;
grant execute on function public.mark_settlement_paid(uuid, date, public.payment_method, text, uuid) to authenticated;
-- Re-granted, because the function was replaced.
grant execute on function public.can_view_file_row(public.files) to authenticated;
