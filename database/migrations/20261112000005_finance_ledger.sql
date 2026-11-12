-- Stage 7 of the HR and Finance build: the finance ledger.
--
-- * Income and expense categories, configurable. A few are marked as system categories
--   because money elsewhere is filed under them automatically (salaries, settlements).
-- * Bank accounts, with the account number encrypted by the app and shown masked, plus
--   one "Cash in hand" account. Balances are worked out: opening balance plus money in
--   less money out.
-- * Income without an invoice, and expenses. Each money movement has one source, so
--   nothing is counted twice: invoice money stays in payments; paid payroll and paid
--   settlements create their expense automatically, in the same transaction. Money
--   records are never deleted, only marked removed with a reason.
-- * money_movements: one read-only list of every movement, built from those sources.
-- * Bank statement lines imported from CSV, matched to movements to reconcile.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('ledger.manage', 'Finance', 'Keep income and expenses',
   'Record income and expenses, and see every money movement.', '{organisation}', 1070),
  ('banks.manage', 'Finance', 'Manage bank accounts',
   'Add bank and cash accounts, import statements and reconcile them.', '{organisation}', 1080);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, 'organisation'
from public.roles r
cross join public.permissions p
where (r.name = 'Founder' or r.name = 'Finance Head') and p.key in ('ledger.manage', 'banks.manage')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

create function public.can_see_ledger()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('ledger.manage') or public.has_permission('banks.manage')
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (length(trim(name)) between 2 and 80),
  -- Money from elsewhere in the app is filed here automatically.
  system_key text unique check (system_key in ('salaries', 'settlements', 'reimbursements', 'purchases')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index finance_categories_name_unique on public.finance_categories (kind, lower(name));

insert into public.finance_categories (kind, name, system_key, sort_order) values
  ('expense', 'Salaries', 'salaries', 10),
  ('expense', 'Full and final settlements', 'settlements', 20),
  ('expense', 'Reimbursements', 'reimbursements', 30),
  ('expense', 'Purchases', 'purchases', 40),
  ('expense', 'Rent', null, 50),
  ('expense', 'Utilities', null, 60),
  ('expense', 'Software and subscriptions', null, 70),
  ('expense', 'Travel', null, 80),
  ('expense', 'Marketing', null, 90),
  ('expense', 'Office supplies', null, 100),
  ('expense', 'Professional fees', null, 110),
  ('expense', 'Bank charges', null, 120),
  ('expense', 'Other expenses', null, 900),
  ('income', 'Interest', null, 10),
  ('income', 'Other income', null, 900);

create function public.system_category(p_key text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.finance_categories where system_key = p_key
$$;

-- System categories stay, because automatic expenses are filed under them.
create function public.guard_finance_category()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null then
      raise exception 'This category is used automatically, so it cannot be removed.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.system_key is not null
     and (new.system_key is distinct from old.system_key or new.kind is distinct from old.kind or not new.is_active) then
    raise exception 'This category is used automatically. You can rename it, but not turn it off.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger finance_categories_guard before update or delete on public.finance_categories
  for each row execute function public.guard_finance_category();

-- ---------------------------------------------------------------------------
-- Bank and cash accounts
-- ---------------------------------------------------------------------------

create type public.bank_account_type as enum ('savings', 'current', 'cash', 'other');

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  account_type public.bank_account_type not null default 'current',
  bank_name text check (length(trim(bank_name)) between 2 and 120),
  account_holder text check (length(trim(account_holder)) between 2 and 120),
  -- Encrypted by the app with FIELD_ENCRYPTION_KEY, like employee bank details.
  account_number_encrypted text check (account_number_encrypted ~ '^v1:'),
  account_last4 text check (account_last4 ~ '^\d{4}$'),
  ifsc text check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  opening_balance numeric(14, 2) not null default 0,
  -- Money before this date is already in the opening balance.
  opening_date date not null default public.india_today(),
  -- Invoice payments with no account named are counted here.
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_accounts_number_pair check ((account_number_encrypted is null) = (account_last4 is null))
);
create unique index bank_accounts_name_unique on public.bank_accounts (lower(name));
create unique index bank_accounts_one_primary on public.bank_accounts (is_primary) where is_primary;

insert into public.bank_accounts (name, account_type) values ('Cash in hand', 'cash');

-- The account named, if it is active; otherwise the primary account; otherwise cash.
create function public.account_or_default(p_account uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select id from public.bank_accounts where id = p_account and is_active),
    (select id from public.bank_accounts where is_primary and is_active),
    (select id from public.bank_accounts where account_type = 'cash' and is_active order by created_at limit 1)
  )
$$;

-- Invoice payments can name the account they went into. Without one, they count in
-- the primary account.
alter table public.payments add column bank_account_id uuid references public.bank_accounts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Income and expenses
-- ---------------------------------------------------------------------------

create table public.income_records (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.finance_categories (id) on delete restrict,
  client_id uuid references public.clients (id) on delete set null,
  received_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  reference text check (length(reference) <= 120),
  notes text check (length(notes) <= 1000),
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  file_id uuid references public.files (id) on delete set null,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.employees (id) on delete set null,
  delete_reason text check (length(delete_reason) <= 500),
  constraint income_records_deleted check ((deleted_at is null) = (delete_reason is null))
);
create index income_records_date_idx on public.income_records (received_on);
create unique index income_records_reference_unique on public.income_records (bank_account_id, lower(reference))
  where reference is not null and deleted_at is null;

create table public.expense_records (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.finance_categories (id) on delete restrict,
  department_id uuid references public.departments (id) on delete set null,
  vendor_name text check (length(vendor_name) <= 160),
  spent_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  reference text check (length(reference) <= 120),
  notes text check (length(notes) <= 1000),
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  receipt_file_id uuid references public.files (id) on delete set null,
  -- Where an automatic expense came from. Those are changed where they came from.
  source text not null default 'manual' check (source in ('manual', 'payroll', 'settlement', 'reimbursement', 'vendor_bill')),
  source_id uuid,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.employees (id) on delete set null,
  delete_reason text check (length(delete_reason) <= 500),
  constraint expense_records_deleted check ((deleted_at is null) = (delete_reason is null)),
  constraint expense_records_source check ((source = 'manual') = (source_id is null))
);
create index expense_records_date_idx on public.expense_records (spent_on);
create unique index expense_records_source_unique on public.expense_records (source, source_id) where source <> 'manual';
create unique index expense_records_reference_unique on public.expense_records (bank_account_id, lower(reference))
  where reference is not null and deleted_at is null and source = 'manual';

-- New entries are stamped with who made them and must use a category of the right kind
-- and an active account. Removed entries cannot change. Automatic expenses can only be
-- changed where they came from. Removal goes through remove_ledger_entry.
create function public.guard_ledger_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text := case when tg_table_name = 'income_records' then 'income' else 'expense' end;
begin
  if current_setting('app.trusted_ledger', true) = 'on' then
    return new;
  end if;

  if not exists (select 1 from public.finance_categories where id = new.category_id and kind = v_kind) then
    raise exception 'Choose an % category.', v_kind using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := public.current_employee_id();
    end if;
    new.deleted_at := null;
    new.deleted_by := null;
    new.delete_reason := null;
    if tg_table_name = 'expense_records' and (select auth.uid()) is not null then
      new.source := 'manual';
      new.source_id := null;
    end if;
    if not exists (select 1 from public.bank_accounts where id = new.bank_account_id and is_active) then
      raise exception 'Choose an active account.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'A removed entry cannot be changed.' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'expense_records' and old.source <> 'manual' then
    raise exception 'This expense was created automatically. Change it where it came from.' using errcode = 'check_violation';
  end if;
  if new.deleted_at is distinct from old.deleted_at or new.created_by is distinct from old.created_by then
    raise exception 'Use Remove to remove an entry.' using errcode = 'insufficient_privilege';
  end if;
  if tg_table_name = 'expense_records' and (new.source is distinct from old.source or new.source_id is distinct from old.source_id) then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger income_records_guard before insert or update on public.income_records
  for each row execute function public.guard_ledger_entry();
create trigger expense_records_guard before insert or update on public.expense_records
  for each row execute function public.guard_ledger_entry();

create function public.remove_ledger_entry(p_kind text, p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_permission('ledger.manage') then
    raise exception 'You do not have permission to remove entries.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Give a reason for removing it.' using errcode = 'check_violation';
  end if;

  perform set_config('app.trusted_ledger', 'on', true);
  if p_kind = 'income' then
    update public.income_records set deleted_at = now(), deleted_by = public.current_employee_id(), delete_reason = trim(p_reason)
    where id = p_id and deleted_at is null;
  elsif p_kind = 'expense' then
    update public.expense_records set deleted_at = now(), deleted_by = public.current_employee_id(), delete_reason = trim(p_reason)
    where id = p_id and deleted_at is null and source = 'manual';
  else
    raise exception 'Unknown entry.' using errcode = 'check_violation';
  end if;
  if not found then
    raise exception 'This entry cannot be removed. Automatic expenses are changed where they came from.' using errcode = 'check_violation';
  end if;
  perform set_config('app.trusted_ledger', 'off', true);
end;
$$;

-- Records an automatic expense, once per source.
create function public.record_system_expense(
  p_source text, p_source_id uuid, p_category text, p_amount numeric, p_on date,
  p_method public.payment_method, p_reference text, p_account uuid, p_notes text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_amount <= 0 then
    return;
  end if;
  perform set_config('app.trusted_ledger', 'on', true);
  insert into public.expense_records
    (category_id, spent_on, amount, method, reference, notes, bank_account_id, source, source_id, created_by)
  values (public.system_category(p_category), p_on, p_amount, p_method, nullif(trim(p_reference), ''), p_notes,
          public.account_or_default(p_account), p_source, p_source_id, public.current_employee_id())
  on conflict (source, source_id) where source <> 'manual' do nothing;
  perform set_config('app.trusted_ledger', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Paying payroll and settlements now names the account, and files the expense.
-- ---------------------------------------------------------------------------

drop function public.mark_payroll_paid(uuid, date, public.payment_method, text);

create function public.mark_payroll_paid(
  p_run uuid, p_paid_on date, p_method public.payment_method, p_reference text, p_account uuid default null
)
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

  perform public.record_system_expense('payroll', p_run, 'salaries', v_run.total_net, p_paid_on, p_method, p_reference, p_account,
    'Salaries for ' || public.payroll_month_label(v_run.month));

  for v_person in select employee_id from public.payroll_lines where run_id = p_run loop
    perform public.notify(v_person, 'salary_paid', 'Your payslip is ready',
      'Salary for ' || public.payroll_month_label(v_run.month) || ' is paid.', '/payslips');
  end loop;
  perform public.notify(v_run.prepared_by, 'salary_paid', 'Payroll was paid',
    public.payroll_month_label(v_run.month), '/hr/payroll/' || p_run);
end;
$$;

drop function public.mark_settlement_paid(uuid, date, public.payment_method, text);

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

  select full_name into v_name from public.employees where id = v_settlement.employee_id;
  perform public.record_system_expense('settlement', p_resignation, 'settlements', v_settlement.final_amount, p_paid_on, p_method,
    p_reference, p_account, 'Full and final settlement for ' || coalesce(v_name, 'a former employee'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Every money movement, from the one place each is recorded
-- ---------------------------------------------------------------------------

-- Read with the viewer's own access, so it shows only what they may see anyway.
create view public.money_movements with (security_invoker = true) as
  select p.id, 'invoice_payment'::text as kind, 'in'::text as direction, p.payment_date as occurred_on, p.amount, p.method,
         p.reference, coalesce(p.bank_account_id, public.account_or_default(null)) as bank_account_id,
         p.client_id, null::uuid as category_id, null::uuid as department_id,
         c.company_name as counterparty, 'Payment for invoice ' || coalesce(i.invoice_number, 'draft') as description,
         p.invoice_id as linked_id
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  left join public.clients c on c.id = p.client_id
  union all
  select r.id, 'income', 'in', r.received_on, r.amount, r.method, r.reference, r.bank_account_id, r.client_id, r.category_id, null,
         c.company_name, coalesce(r.notes, f.name), null
  from public.income_records r
  join public.finance_categories f on f.id = r.category_id
  left join public.clients c on c.id = r.client_id
  where r.deleted_at is null
  union all
  select e.id, case when e.source = 'manual' then 'expense' else e.source end, 'out', e.spent_on, e.amount, e.method, e.reference,
         e.bank_account_id, null, e.category_id, e.department_id, e.vendor_name, coalesce(e.notes, f.name), e.source_id
  from public.expense_records e
  join public.finance_categories f on f.id = e.category_id
  where e.deleted_at is null;

-- One page of movements with filters, plus how many match, for the Transactions page.
create function public.get_money_movements(
  p_from date, p_to date, p_account uuid default null, p_direction text default null, p_method public.payment_method default null,
  p_kind text default null, p_search text default null, p_limit integer default 50, p_offset integer default 0
)
returns table (
  id uuid, kind text, direction text, occurred_on date, amount numeric, method public.payment_method, reference text,
  bank_account_id uuid, account_name text, client_id uuid, category_name text, counterparty text, description text,
  linked_id uuid, total_count bigint, total_in numeric, total_out numeric
)
language plpgsql stable set search_path = ''
as $$
begin
  if not public.can_see_ledger() then
    raise exception 'You do not have permission to see transactions.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with filtered as (
    select m.*, a.name as account_name, f.name as category_name
    from public.money_movements m
    left join public.bank_accounts a on a.id = m.bank_account_id
    left join public.finance_categories f on f.id = m.category_id
    where m.occurred_on between p_from and p_to
      and (p_account is null or m.bank_account_id = p_account)
      and (p_direction is null or m.direction = p_direction)
      and (p_method is null or m.method = p_method)
      and (p_kind is null or m.kind = p_kind)
      and (p_search is null or p_search = ''
           or m.description ilike '%' || p_search || '%'
           or m.counterparty ilike '%' || p_search || '%'
           or m.reference ilike '%' || p_search || '%')
  )
  select f.id, f.kind, f.direction, f.occurred_on, f.amount, f.method, f.reference, f.bank_account_id, f.account_name,
         f.client_id, f.category_name, f.counterparty, f.description, f.linked_id,
         count(*) over (), coalesce(sum(f.amount) filter (where f.direction = 'in') over (), 0),
         coalesce(sum(f.amount) filter (where f.direction = 'out') over (), 0)
  from filtered f
  order by f.occurred_on desc, f.kind, f.id
  limit p_limit offset p_offset;
end;
$$;

-- Each account's balance: opening balance plus money in less money out since the
-- opening date, up to p_on.
create function public.get_account_balances(p_on date default null)
returns table (bank_account_id uuid, name text, account_type public.bank_account_type, opening_balance numeric,
               money_in numeric, money_out numeric, balance numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_on date := coalesce(p_on, public.india_today());
begin
  if not (public.can_see_ledger() or public.has_permission('payroll.approve')) then
    raise exception 'You do not have permission to see balances.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select a.id, a.name, a.account_type, a.opening_balance,
         coalesce(sum(m.amount) filter (where m.direction = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.direction = 'out'), 0),
         a.opening_balance + coalesce(sum(m.amount) filter (where m.direction = 'in'), 0)
           - coalesce(sum(m.amount) filter (where m.direction = 'out'), 0)
  from public.bank_accounts a
  left join public.money_movements m on m.bank_account_id = a.id and m.occurred_on >= a.opening_date and m.occurred_on <= v_on
  group by a.id
  order by a.account_type = 'cash', a.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bank statements and reconciliation
-- ---------------------------------------------------------------------------

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  line_date date not null,
  description text not null default '' check (length(description) <= 500),
  reference text check (length(reference) <= 120),
  -- Money in is positive, money out negative.
  amount numeric(14, 2) not null check (amount <> 0),
  balance numeric(14, 2),
  imported_by uuid references public.employees (id) on delete set null,
  imported_at timestamptz not null default now(),
  matched_kind text,
  matched_id uuid,
  matched_by uuid references public.employees (id) on delete set null,
  matched_at timestamptz,
  constraint bank_statement_lines_match check ((matched_kind is null) = (matched_id is null))
);
create index bank_statement_lines_account_idx on public.bank_statement_lines (bank_account_id, line_date desc);
-- The same line imported twice is skipped.
create unique index bank_statement_lines_unique on public.bank_statement_lines
  (bank_account_id, line_date, amount, coalesce(reference, ''), md5(description));
-- A movement matches one line at most.
create unique index bank_statement_lines_matched_unique on public.bank_statement_lines (matched_kind, matched_id)
  where matched_id is not null;

-- Rows are {"date": "2026-11-05", "description": "...", "reference": "...", "amount": -1200.50, "balance": 9000}.
create function public.import_statement_lines(p_account uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]';
  v_line integer := 0;
  v_count integer;
begin
  if not public.has_permission('banks.manage') then
    raise exception 'You do not have permission to import statements.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_account) then
    raise exception 'Choose an account.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send up to 5000 lines at a time.' using errcode = 'check_violation';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1;
    begin
      insert into public.bank_statement_lines (bank_account_id, line_date, description, reference, amount, balance, imported_by)
      values (p_account, (v_row ->> 'date')::date, left(coalesce(v_row ->> 'description', ''), 500),
              nullif(left(trim(coalesce(v_row ->> 'reference', '')), 120), ''), (v_row ->> 'amount')::numeric,
              nullif(v_row ->> 'balance', '')::numeric, public.current_employee_id())
      on conflict do nothing;
      get diagnostics v_count = row_count;
      if v_count = 0 then
        v_skipped := v_skipped + 1;
      else
        v_imported := v_imported + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('line', v_line, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped, 'errors', v_errors);
end;
$$;

-- Matches a statement line to a movement in the same account, for the same amount and
-- in the same direction.
create function public.match_statement_line(p_line uuid, p_kind text, p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_line public.bank_statement_lines;
  v_movement record;
begin
  if not public.has_permission('banks.manage') then
    raise exception 'You do not have permission to reconcile.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_line from public.bank_statement_lines where id = p_line for update;
  select * into v_movement from public.money_movements where kind = p_kind and id = p_id;
  if v_line.id is null or v_movement.id is null then
    raise exception 'That line or movement could not be found.' using errcode = 'no_data_found';
  end if;
  if v_movement.bank_account_id is distinct from v_line.bank_account_id then
    raise exception 'That movement is in a different account.' using errcode = 'check_violation';
  end if;
  if v_movement.amount <> abs(v_line.amount) or (v_movement.direction = 'in') <> (v_line.amount > 0) then
    raise exception 'The amounts do not match.' using errcode = 'check_violation';
  end if;

  update public.bank_statement_lines
  set matched_kind = p_kind, matched_id = p_id, matched_by = public.current_employee_id(), matched_at = now()
  where id = p_line;
end;
$$;

create function public.unmatch_statement_line(p_line uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_permission('banks.manage') then
    raise exception 'You do not have permission to reconcile.' using errcode = 'insufficient_privilege';
  end if;
  update public.bank_statement_lines set matched_kind = null, matched_id = null, matched_by = null, matched_at = null where id = p_line;
end;
$$;

-- For each unmatched line, movements in the same account with the same amount and
-- direction within five days that are not matched yet.
create function public.get_statement_suggestions(p_account uuid)
returns table (line_id uuid, kind text, movement_id uuid, occurred_on date, description text, counterparty text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('banks.manage') then
    raise exception 'You do not have permission to reconcile.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select l.id, m.kind, m.id, m.occurred_on, m.description, m.counterparty
  from public.bank_statement_lines l
  join public.money_movements m
    on m.bank_account_id = l.bank_account_id
   and m.amount = abs(l.amount)
   and (m.direction = 'in') = (l.amount > 0)
   and abs(m.occurred_on - l.line_date) <= 5
  where l.bank_account_id = p_account and l.matched_id is null
    and not exists (select 1 from public.bank_statement_lines x where x.matched_kind = m.kind and x.matched_id = m.id)
  order by l.line_date desc, abs(m.occurred_on - l.line_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger finance_categories_set_updated_at before update on public.finance_categories
  for each row execute function public.set_updated_at();
create trigger bank_accounts_set_updated_at before update on public.bank_accounts
  for each row execute function public.set_updated_at();
create trigger income_records_set_updated_at before update on public.income_records
  for each row execute function public.set_updated_at();
create trigger expense_records_set_updated_at before update on public.expense_records
  for each row execute function public.set_updated_at();

create trigger finance_categories_audit after insert or update or delete on public.finance_categories
  for each row execute function public.audit_row_change();
create trigger bank_accounts_audit after insert or update or delete on public.bank_accounts
  for each row execute function public.audit_row_change();
create trigger income_records_audit after insert or update on public.income_records
  for each row execute function public.audit_row_change();
create trigger expense_records_audit after insert or update on public.expense_records
  for each row execute function public.audit_row_change();
create trigger bank_statement_lines_audit after update of matched_id on public.bank_statement_lines
  for each row execute function public.audit_row_change();

alter table public.finance_categories enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.income_records enable row level security;
alter table public.expense_records enable row level security;
alter table public.bank_statement_lines enable row level security;

-- Everyone may read categories, for claiming reimbursements later.
create policy finance_categories_select on public.finance_categories for select to authenticated
  using (public.current_employee_id() is not null);
create policy finance_categories_write on public.finance_categories for all to authenticated
  using (public.has_permission('ledger.manage')) with check (public.has_permission('ledger.manage'));

-- Finance chooses accounts when paying payroll and settlements, too.
create policy bank_accounts_select on public.bank_accounts for select to authenticated
  using (public.can_see_ledger() or public.has_permission('payroll.approve'));
create policy bank_accounts_insert on public.bank_accounts for insert to authenticated
  with check (public.has_permission('banks.manage'));
create policy bank_accounts_update on public.bank_accounts for update to authenticated
  using (public.has_permission('banks.manage')) with check (public.has_permission('banks.manage'));

create policy income_records_select on public.income_records for select to authenticated
  using (public.can_see_ledger());
create policy income_records_insert on public.income_records for insert to authenticated
  with check (public.has_permission('ledger.manage'));
create policy income_records_update on public.income_records for update to authenticated
  using (public.has_permission('ledger.manage')) with check (public.has_permission('ledger.manage'));

create policy expense_records_select on public.expense_records for select to authenticated
  using (public.can_see_ledger());
create policy expense_records_insert on public.expense_records for insert to authenticated
  with check (public.has_permission('ledger.manage'));
create policy expense_records_update on public.expense_records for update to authenticated
  using (public.has_permission('ledger.manage')) with check (public.has_permission('ledger.manage'));

create policy bank_statement_lines_select on public.bank_statement_lines for select to authenticated
  using (public.has_permission('banks.manage'));

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.finance_categories to authenticated;
grant select, insert, update on public.bank_accounts to authenticated;
grant select, insert, update on public.income_records to authenticated;
grant select, insert, update on public.expense_records to authenticated;
grant select on public.bank_statement_lines to authenticated;
grant select on public.money_movements to authenticated;

grant execute on function public.can_see_ledger() to authenticated;
grant execute on function public.account_or_default(uuid) to authenticated;
grant execute on function public.remove_ledger_entry(text, uuid, text) to authenticated;
grant execute on function public.get_money_movements(date, date, uuid, text, public.payment_method, text, text, integer, integer) to authenticated;
grant execute on function public.get_account_balances(date) to authenticated;
grant execute on function public.import_statement_lines(uuid, jsonb) to authenticated;
grant execute on function public.match_statement_line(uuid, text, uuid) to authenticated;
grant execute on function public.unmatch_statement_line(uuid) to authenticated;
grant execute on function public.get_statement_suggestions(uuid) to authenticated;
grant execute on function public.mark_payroll_paid(uuid, date, public.payment_method, text, uuid) to authenticated;
grant execute on function public.mark_settlement_paid(uuid, date, public.payment_method, text, uuid) to authenticated;
