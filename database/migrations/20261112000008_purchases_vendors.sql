-- Stage 9 of the HR and Finance build: vendors, purchase orders and vendor bills.
--
-- * Vendors with contact details, GSTIN and address.
-- * Purchase orders with items, using the same item rules and GST split as invoices,
--   numbered PO/26-27/0001 per financial year when issued, and printable.
-- * Vendor bills with the bill file, one bill number per vendor. Paying a bill (in full
--   or in parts) records the payment and files the expense automatically, in the same
--   transaction, so each payment is counted once. Status follows the payments: unpaid,
--   part paid, paid.
-- * Bills due in three days are added to the morning reminders for Finance.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('purchases.manage', 'Finance', 'Manage purchases',
   'Keep vendors, raise purchase orders, record vendor bills and pay them.', '{organisation}', 1090);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'purchases.manage', 'organisation'
from public.roles r
where r.name in ('Founder', 'Finance Head')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

alter table public.finance_settings
  add column po_prefix text not null default 'PO' check (po_prefix ~ '^[A-Z0-9]{1,5}$');

create function public.can_manage_purchases()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('purchases.manage')
$$;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  contact_person text check (length(contact_person) <= 120),
  email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  phone text check (phone ~ '^[+\d][\d\s()-]{6,19}$'),
  gstin text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  address text check (length(address) <= 500),
  state text check (length(state) <= 60),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  notes text check (length(notes) <= 2000),
  is_active boolean not null default true,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendors_name_unique on public.vendors (lower(name));

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------

create type public.purchase_order_status as enum ('draft', 'issued', 'received', 'cancelled');

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  -- Given when the order is issued, so drafts leave no gaps.
  po_number text unique,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  title text not null check (length(trim(title)) between 2 and 200),
  order_date date not null default public.india_today(),
  expected_date date,
  status public.purchase_order_status not null default 'draft',
  -- The vendor's state, which decides CGST and SGST or IGST, as for invoices.
  place_of_supply text check (length(place_of_supply) <= 60),
  is_inter_state boolean not null default false,
  subtotal numeric(14, 2) not null default 0,
  cgst_total numeric(14, 2) not null default 0,
  sgst_total numeric(14, 2) not null default 0,
  igst_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  delivery_address text check (length(delivery_address) <= 500),
  notes text check (length(notes) <= 2000),
  terms text check (length(terms) <= 2000),
  issued_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (length(cancel_reason) <= 500),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_orders_vendor_idx on public.purchase_orders (vendor_id);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  position integer not null,
  description text not null check (length(trim(description)) between 1 and 500),
  hsn_sac text check (hsn_sac ~ '^[0-9]{4,8}$'),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null check (tax_rate between 0 and 40),
  taxable_amount numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null
);
create index purchase_order_items_order_idx on public.purchase_order_items (purchase_order_id, position);

create table public.po_number_counters (
  financial_year text primary key,
  last_number integer not null
);

-- Totals are written only by save_purchase_order. Issuing gives the number; an issued
-- order can be marked received or cancelled, but not edited.
create function public.guard_purchase_order()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_internal boolean := public.finance_internal_write();
  v_vendor public.vendors;
  v_year text;
  v_number integer;
  v_prefix text;
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.po_number := null;
    new.issued_at := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
    if not v_internal then
      new.subtotal := 0;
      new.tax_total := 0;
    end if;
    if (select auth.uid()) is not null then
      new.created_by := public.current_employee_id();
    end if;
  else
    if new.po_number is distinct from old.po_number or new.issued_at is distinct from old.issued_at
       or new.cancelled_at is distinct from old.cancelled_at or new.created_by is distinct from old.created_by then
      raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
    end if;
    if not v_internal then
      new.subtotal := old.subtotal;
      new.tax_total := old.tax_total;
    end if;
    if old.status <> 'draft' and (
      new.vendor_id is distinct from old.vendor_id or new.title is distinct from old.title
      or new.order_date is distinct from old.order_date or new.subtotal is distinct from old.subtotal
      or new.tax_total is distinct from old.tax_total or new.place_of_supply is distinct from old.place_of_supply
    ) then
      raise exception 'An issued purchase order cannot be changed. Cancel it and raise a new one.' using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status then
      if old.status = 'draft' and new.status = 'issued' then
        if old.subtotal + old.tax_total <= 0 or not exists (select 1 from public.purchase_order_items where purchase_order_id = new.id) then
          raise exception 'Add at least one item with an amount before issuing.' using errcode = 'check_violation';
        end if;
        v_year := public.financial_year_label(new.order_date);
        insert into public.po_number_counters as c (financial_year, last_number) values (v_year, 1)
        on conflict (financial_year) do update set last_number = c.last_number + 1
        returning last_number into v_number;
        select po_prefix into v_prefix from public.finance_settings;
        new.po_number := coalesce(v_prefix, 'PO') || '/' || v_year || '/' || lpad(v_number::text, 4, '0');
        new.issued_at := now();
      elsif old.status = 'issued' and new.status = 'received' then
        null;
      elsif old.status in ('draft', 'issued') and new.status = 'cancelled' then
        if coalesce(trim(new.cancel_reason), '') = '' then
          raise exception 'Give a reason for cancelling.' using errcode = 'check_violation';
        end if;
        new.cancelled_at := now();
      else
        raise exception 'You cannot move this purchase order from % to %.', old.status, new.status using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or old.status = 'draft' then
    select * into v_vendor from public.vendors where id = new.vendor_id;
    new.place_of_supply := coalesce(nullif(trim(new.place_of_supply), ''), v_vendor.state);
  end if;
  return new;
end;
$$;

create trigger purchase_orders_guard before insert or update on public.purchase_orders
  for each row execute function public.guard_purchase_order();
-- The same GST split as invoices: within the company's state CGST and SGST, else IGST.
create trigger purchase_orders_split_tax before insert or update on public.purchase_orders
  for each row execute function public.apply_gst_split();

-- Creates or updates a draft order and replaces its items in one step, with the same
-- item rules as invoices.
create function public.save_purchase_order(p_order uuid, p_values jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_order;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
begin
  if not public.can_manage_purchases() then
    raise exception 'You do not have permission to raise purchase orders.' using errcode = 'insufficient_privilege';
  end if;
  v_items := public.normalize_items(p_items);
  select coalesce(sum(l.taxable_amount), 0), coalesce(sum(l.tax_amount), 0) into v_subtotal, v_tax from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'on', true);
  if v_id is null then
    insert into public.purchase_orders (vendor_id, title, order_date, expected_date, place_of_supply, delivery_address, notes, terms, subtotal, tax_total)
    values ((p_values ->> 'vendor_id')::uuid, p_values ->> 'title', coalesce((p_values ->> 'order_date')::date, public.india_today()),
            (p_values ->> 'expected_date')::date, p_values ->> 'place_of_supply', p_values ->> 'delivery_address',
            p_values ->> 'notes', p_values ->> 'terms', v_subtotal, v_tax)
    returning id into v_id;
  else
    if not exists (select 1 from public.purchase_orders where id = v_id and status = 'draft') then
      raise exception 'Only a draft purchase order can be changed.' using errcode = 'check_violation';
    end if;
    update public.purchase_orders set
      vendor_id = (p_values ->> 'vendor_id')::uuid, title = p_values ->> 'title',
      order_date = coalesce((p_values ->> 'order_date')::date, order_date), expected_date = (p_values ->> 'expected_date')::date,
      place_of_supply = p_values ->> 'place_of_supply', delivery_address = p_values ->> 'delivery_address',
      notes = p_values ->> 'notes', terms = p_values ->> 'terms', subtotal = v_subtotal, tax_total = v_tax
    where id = v_id;
    delete from public.purchase_order_items where purchase_order_id = v_id;
  end if;

  insert into public.purchase_order_items (purchase_order_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount)
  select v_id, l.position, l.description, l.hsn_sac, l.quantity, l.unit_price, l.tax_rate, l.taxable_amount, l.tax_amount
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vendor bills and their payments
-- ---------------------------------------------------------------------------

create table public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders (id) on delete set null,
  bill_number text not null check (length(trim(bill_number)) between 1 and 60),
  bill_date date not null,
  due_date date not null,
  -- The bill's total, including GST.
  amount numeric(14, 2) not null check (amount > 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  amount_paid numeric(14, 2) not null default 0,
  description text check (length(description) <= 1000),
  -- The expense category its payments are filed under.
  category_id uuid not null references public.finance_categories (id) on delete restrict,
  department_id uuid references public.departments (id) on delete set null,
  file_id uuid references public.files (id) on delete set null,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.employees (id) on delete set null,
  delete_reason text check (length(delete_reason) <= 500),
  constraint vendor_bills_dates check (due_date >= bill_date),
  constraint vendor_bills_paid check (amount_paid >= 0 and amount_paid <= amount),
  constraint vendor_bills_tax check (tax_amount <= amount),
  constraint vendor_bills_deleted check ((deleted_at is null) = (delete_reason is null))
);
create unique index vendor_bills_number_unique on public.vendor_bills (vendor_id, lower(bill_number)) where deleted_at is null;
create index vendor_bills_due_idx on public.vendor_bills (due_date) where deleted_at is null;

create table public.vendor_bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.vendor_bills (id) on delete restrict,
  paid_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  reference text check (length(reference) <= 120),
  bank_account_id uuid not null references public.bank_accounts (id) on delete restrict,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.employees (id) on delete set null,
  delete_reason text check (length(delete_reason) <= 500),
  constraint vendor_bill_payments_deleted check ((deleted_at is null) = (delete_reason is null))
);
create index vendor_bill_payments_bill_idx on public.vendor_bill_payments (bill_id);

-- Unpaid, part paid or paid, from the payments.
create function public.vendor_bill_status(p_amount numeric, p_paid numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case when p_paid >= p_amount then 'paid' when p_paid > 0 then 'part_paid' else 'unpaid' end
$$;

create function public.guard_vendor_bill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('app.trusted_purchases', true) = 'on' then
    return new;
  end if;
  if not exists (select 1 from public.finance_categories where id = new.category_id and kind = 'expense') then
    raise exception 'Choose an expense category.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.amount_paid := 0;
    new.deleted_at := null;
    new.deleted_by := null;
    new.delete_reason := null;
    if (select auth.uid()) is not null then
      new.created_by := public.current_employee_id();
    end if;
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'A removed bill cannot be changed.' using errcode = 'check_violation';
  end if;
  if new.amount_paid is distinct from old.amount_paid or new.deleted_at is distinct from old.deleted_at or new.created_by is distinct from old.created_by then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;
  if new.amount < old.amount_paid then
    raise exception 'The bill cannot be less than what has been paid against it.' using errcode = 'check_violation';
  end if;
  if old.amount_paid > 0 and new.vendor_id is distinct from old.vendor_id then
    raise exception 'A bill with payments cannot move to another vendor.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger vendor_bills_guard before insert or update on public.vendor_bills
  for each row execute function public.guard_vendor_bill();

-- Records an expense filed under a given category, once per source. Automatic expenses
-- from payroll and settlements use record_system_expense, which finds the category.
create function public.record_source_expense(
  p_source text, p_source_id uuid, p_category uuid, p_amount numeric, p_on date, p_method public.payment_method,
  p_reference text, p_account uuid, p_notes text, p_vendor text default null, p_department uuid default null, p_file uuid default null
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
    (category_id, spent_on, amount, method, reference, notes, bank_account_id, source, source_id, created_by, vendor_name, department_id, receipt_file_id)
  values (p_category, p_on, p_amount, p_method, nullif(trim(p_reference), ''), p_notes, public.account_or_default(p_account),
          p_source, p_source_id, public.current_employee_id(), p_vendor, p_department, p_file)
  on conflict (source, source_id) where source <> 'manual' do nothing;
  perform set_config('app.trusted_ledger', 'off', true);
end;
$$;

create function public.pay_vendor_bill(
  p_bill uuid, p_amount numeric, p_paid_on date, p_method public.payment_method, p_reference text, p_account uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_bill public.vendor_bills;
  v_vendor text;
  v_payment uuid;
begin
  if not public.can_manage_purchases() then
    raise exception 'You do not have permission to pay vendor bills.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_bill from public.vendor_bills where id = p_bill and deleted_at is null for update;
  if v_bill.id is null then
    raise exception 'This bill could not be found.' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount paid.' using errcode = 'check_violation';
  end if;
  if p_amount > v_bill.amount - v_bill.amount_paid then
    raise exception 'This is more than the % still due on the bill.', public.format_rupees(v_bill.amount - v_bill.amount_paid) using errcode = 'check_violation';
  end if;
  if p_paid_on is null or p_paid_on > public.india_today() then
    raise exception 'The payment date cannot be in the future.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_account and is_active) then
    raise exception 'Choose the account it was paid from.' using errcode = 'check_violation';
  end if;

  insert into public.vendor_bill_payments (bill_id, paid_on, amount, method, reference, bank_account_id, created_by)
  values (p_bill, p_paid_on, p_amount, p_method, nullif(trim(p_reference), ''), p_account, public.current_employee_id())
  returning id into v_payment;

  perform set_config('app.trusted_purchases', 'on', true);
  update public.vendor_bills set amount_paid = amount_paid + p_amount where id = p_bill;
  perform set_config('app.trusted_purchases', 'off', true);

  select name into v_vendor from public.vendors where id = v_bill.vendor_id;
  perform public.record_source_expense('vendor_bill', v_payment, v_bill.category_id, p_amount, p_paid_on, p_method, p_reference, p_account,
    'Bill ' || v_bill.bill_number, v_vendor, v_bill.department_id, v_bill.file_id);
  return v_payment;
end;
$$;

-- Undoes a payment entered by mistake: it is kept, marked removed, and so is its expense.
create function public.remove_vendor_bill_payment(p_payment uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.vendor_bill_payments;
begin
  if not public.can_manage_purchases() then
    raise exception 'You do not have permission to change vendor payments.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Give a reason for removing it.' using errcode = 'check_violation';
  end if;
  select * into v_payment from public.vendor_bill_payments where id = p_payment and deleted_at is null for update;
  if v_payment.id is null then
    raise exception 'This payment could not be found.' using errcode = 'no_data_found';
  end if;

  update public.vendor_bill_payments set deleted_at = now(), deleted_by = public.current_employee_id(), delete_reason = trim(p_reason)
  where id = p_payment;

  perform set_config('app.trusted_purchases', 'on', true);
  update public.vendor_bills set amount_paid = amount_paid - v_payment.amount where id = v_payment.bill_id;
  perform set_config('app.trusted_purchases', 'off', true);

  perform set_config('app.trusted_ledger', 'on', true);
  update public.expense_records set deleted_at = now(), deleted_by = public.current_employee_id(), delete_reason = 'Vendor payment removed: ' || trim(p_reason)
  where source = 'vendor_bill' and source_id = p_payment and deleted_at is null;
  perform set_config('app.trusted_ledger', 'off', true);
end;
$$;

-- Removes a bill entered by mistake. Only an unpaid bill can be removed.
create function public.remove_vendor_bill(p_bill uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_purchases() then
    raise exception 'You do not have permission to remove bills.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Give a reason for removing it.' using errcode = 'check_violation';
  end if;
  perform set_config('app.trusted_purchases', 'on', true);
  update public.vendor_bills set deleted_at = now(), deleted_by = public.current_employee_id(), delete_reason = trim(p_reason)
  where id = p_bill and deleted_at is null and amount_paid = 0;
  if not found then
    raise exception 'Only an unpaid bill can be removed. Remove its payments first.' using errcode = 'check_violation';
  end if;
  perform set_config('app.trusted_purchases', 'off', true);
end;
$$;

-- Bills due in three days, each morning, to whoever manages purchases.
create function public.send_vendor_bill_reminders()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_bill record;
  v_person uuid;
begin
  for v_bill in
    select b.id, b.bill_number, b.due_date, b.amount - b.amount_paid as balance, v.name
    from public.vendor_bills b join public.vendors v on v.id = b.vendor_id
    where b.deleted_at is null and b.amount_paid < b.amount and b.due_date = public.india_today() + 3
  loop
    for v_person in select id from public.employees_with_permission('purchases.manage', 'organisation') as p (id) loop
      perform public.notify(v_person, 'vendor_bill_due', 'A vendor bill is due in 3 days',
        v_bill.name || ', bill ' || v_bill.bill_number || ': ' || public.format_rupees(v_bill.balance),
        '/finance/purchases/bills/' || v_bill.id, 'normal', null, 'vendor-bill-due:' || v_bill.id || ':' || v_bill.due_date);
    end loop;
  end loop;
end;
$$;

select cron.schedule('send-vendor-bill-reminders', '35 3 * * *', $$select public.send_vendor_bill_reminders()$$);

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger vendors_stamp before insert on public.vendors
  for each row execute function public.stamp_recruitment_row();
create trigger vendors_set_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
create trigger vendor_bills_set_updated_at before update on public.vendor_bills
  for each row execute function public.set_updated_at();

create trigger vendors_audit after insert or update or delete on public.vendors
  for each row execute function public.audit_row_change();
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders
  for each row execute function public.audit_row_change();
create trigger vendor_bills_audit after insert or update on public.vendor_bills
  for each row execute function public.audit_row_change();
create trigger vendor_bill_payments_audit after insert or update on public.vendor_bill_payments
  for each row execute function public.audit_row_change();

alter table public.vendors enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.po_number_counters enable row level security;
alter table public.vendor_bills enable row level security;
alter table public.vendor_bill_payments enable row level security;

create policy vendors_select on public.vendors for select to authenticated using (public.can_manage_purchases() or public.can_see_ledger());
create policy vendors_write on public.vendors for all to authenticated
  using (public.can_manage_purchases()) with check (public.can_manage_purchases());

create policy purchase_orders_select on public.purchase_orders for select to authenticated using (public.can_manage_purchases());
create policy purchase_orders_update on public.purchase_orders for update to authenticated
  using (public.can_manage_purchases()) with check (public.can_manage_purchases());
-- Only a draft order is deleted; issued ones are cancelled.
create policy purchase_orders_delete on public.purchase_orders for delete to authenticated
  using (public.can_manage_purchases() and status = 'draft');

create policy purchase_order_items_select on public.purchase_order_items for select to authenticated using (public.can_manage_purchases());

create policy vendor_bills_select on public.vendor_bills for select to authenticated using (public.can_manage_purchases() or public.can_see_ledger());
create policy vendor_bills_insert on public.vendor_bills for insert to authenticated with check (public.can_manage_purchases());
create policy vendor_bills_update on public.vendor_bills for update to authenticated
  using (public.can_manage_purchases()) with check (public.can_manage_purchases());

create policy vendor_bill_payments_select on public.vendor_bill_payments for select to authenticated
  using (public.can_manage_purchases() or public.can_see_ledger());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.vendors to authenticated;
grant select, update, delete on public.purchase_orders to authenticated;
grant select on public.purchase_order_items to authenticated;
grant select, insert, update on public.vendor_bills to authenticated;
grant select on public.vendor_bill_payments to authenticated;

grant execute on function public.can_manage_purchases() to authenticated;
grant execute on function public.save_purchase_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.pay_vendor_bill(uuid, numeric, date, public.payment_method, text, uuid) to authenticated;
grant execute on function public.remove_vendor_bill_payment(uuid, text) to authenticated;
grant execute on function public.remove_vendor_bill(uuid, text) to authenticated;
grant execute on function public.vendor_bill_status(numeric, numeric) to authenticated;
