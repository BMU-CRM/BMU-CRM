-- Quotations, GST invoices, payments and the company's billing details.
--
-- Money is stored in rupees with two decimal places. Every amount is worked out by
-- the database from the line items, so a total can never be typed in or forged.
-- Line items are only written through save_quotation, save_invoice and
-- create_invoice_from_quotation, which recalculate the totals in the same step.

-- ---------------------------------------------------------------------------
-- Billing details
-- ---------------------------------------------------------------------------

create table public.finance_settings (
  id boolean primary key default true check (id),
  legal_name text check (length(legal_name) <= 160),
  gstin text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan text check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  address text check (length(address) <= 500),
  -- Decides whether a sale is within the state (CGST and SGST) or outside it (IGST).
  state text check (length(state) <= 60),
  email text check (length(email) <= 160),
  phone text check (length(phone) <= 30),
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,5}$'),
  default_tax_rate numeric(5, 2) not null default 18 check (default_tax_rate between 0 and 40),
  payment_terms_days integer not null default 15 check (payment_terms_days between 0 and 365),
  quotation_validity_days integer not null default 30 check (quotation_validity_days between 1 and 365),
  bank_details text check (length(bank_details) <= 1000),
  invoice_terms text check (length(invoice_terms) <= 2000),
  quotation_terms text check (length(quotation_terms) <= 2000),
  updated_at timestamptz not null default now()
);
insert into public.finance_settings default values;

-- What a client is billed under. Both are optional.
alter table public.clients
  add column gstin text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
alter table public.clients
  add column billing_state text check (length(billing_state) <= 60);

create type public.quotation_status as enum ('draft', 'sent', 'accepted', 'declined');
create type public.invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');
create type public.payment_method as enum ('bank_transfer', 'upi', 'cheque', 'cash', 'card', 'tds', 'other');

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------

create sequence public.quotation_code_sequence start 1;

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique
    default 'QUO-' || lpad(nextval('public.quotation_code_sequence')::text, 4, '0'),
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 200),
  issue_date date not null default public.india_today(),
  valid_until date not null,
  status public.quotation_status not null default 'draft',
  bill_to_name text check (length(bill_to_name) <= 160),
  bill_to_address text check (length(bill_to_address) <= 500),
  client_gstin text check (client_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  place_of_supply text check (length(place_of_supply) <= 60),
  is_inter_state boolean not null default false,
  subtotal numeric(14, 2) not null default 0,
  cgst_total numeric(14, 2) not null default 0,
  sgst_total numeric(14, 2) not null default 0,
  igst_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  notes text check (length(notes) <= 2000),
  terms text check (length(terms) <= 2000),
  sent_at timestamptz,
  decided_at timestamptz,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotations_dates check (valid_until >= issue_date)
);
create index quotations_client_idx on public.quotations (client_id);
create index quotations_status_idx on public.quotations (status);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  position integer not null,
  description text not null check (length(trim(description)) between 1 and 500),
  hsn_sac text check (hsn_sac ~ '^[0-9]{4,8}$'),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null check (tax_rate between 0 and 40),
  taxable_amount numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null
);
create index quotation_items_quotation_idx on public.quotation_items (quotation_id, position);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  -- Given when the invoice is issued, so drafts never leave gaps in the numbering.
  invoice_number text unique,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  quotation_id uuid references public.quotations (id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 200),
  issue_date date not null default public.india_today(),
  due_date date not null,
  status public.invoice_status not null default 'draft',
  bill_to_name text check (length(bill_to_name) <= 160),
  bill_to_address text check (length(bill_to_address) <= 500),
  client_gstin text check (client_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  place_of_supply text check (length(place_of_supply) <= 60),
  is_inter_state boolean not null default false,
  subtotal numeric(14, 2) not null default 0,
  cgst_total numeric(14, 2) not null default 0,
  sgst_total numeric(14, 2) not null default 0,
  igst_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  notes text check (length(notes) <= 2000),
  terms text check (length(terms) <= 2000),
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (length(cancel_reason) <= 500),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_dates check (due_date >= issue_date),
  constraint invoices_paid_amount check (amount_paid >= 0 and amount_paid <= total)
);
create index invoices_client_idx on public.invoices (client_id);
create index invoices_status_idx on public.invoices (status, due_date);
create index invoices_issue_date_idx on public.invoices (issue_date);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position integer not null,
  description text not null check (length(trim(description)) between 1 and 500),
  hsn_sac text check (hsn_sac ~ '^[0-9]{4,8}$'),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  tax_rate numeric(5, 2) not null check (tax_rate between 0 and 40),
  taxable_amount numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

-- Invoice numbers run in a fresh series each financial year (April to March).
create table public.invoice_number_counters (
  financial_year text primary key,
  last_number integer not null
);

-- A converted quotation remembers its invoice. Added here because invoices point back.
alter table public.quotations add column invoice_id uuid references public.invoices (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  -- Copied from the invoice, so payments appear on the Client 360 timeline.
  client_id uuid references public.clients (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default public.india_today(),
  method public.payment_method not null,
  reference text check (length(reference) <= 120),
  notes text check (length(notes) <= 500),
  recorded_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_date_idx on public.payments (payment_date);

-- ---------------------------------------------------------------------------
-- Amounts
-- ---------------------------------------------------------------------------

create function public.line_taxable_amount(p_quantity numeric, p_unit_price numeric)
returns numeric
language sql immutable set search_path = ''
as $$
  select round(p_quantity * p_unit_price, 2)
$$;

create function public.line_tax_amount(p_taxable numeric, p_rate numeric)
returns numeric
language sql immutable set search_path = ''
as $$
  select round(p_taxable * p_rate / 100, 2)
$$;

-- Indian digit grouping, such as ₹12,34,567.00.
create function public.format_rupees(p_amount numeric)
returns text
language sql immutable set search_path = ''
as $$
  select '₹' || to_char(p_amount, 'FM99,99,99,99,99,990.00')
$$;

-- Splits the tax into CGST and SGST within the company's state, or IGST outside it,
-- and works out the total. Runs on every write, so the figures always agree.
create function public.apply_gst_split()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_state text;
begin
  if tg_op = 'INSERT' or old.status::text in ('draft', 'sent', 'declined') then
    select state into v_state from public.finance_settings;
    new.is_inter_state := coalesce(trim(v_state), '') <> '' and coalesce(trim(new.place_of_supply), '') <> ''
      and lower(trim(v_state)) <> lower(trim(new.place_of_supply));
  end if;

  if new.is_inter_state then
    new.igst_total := new.tax_total;
    new.cgst_total := 0;
    new.sgst_total := 0;
  else
    new.igst_total := 0;
    new.cgst_total := round(new.tax_total / 2, 2);
    new.sgst_total := new.tax_total - new.cgst_total;
  end if;
  new.total := new.subtotal + new.tax_total;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Organisation scope reaches every client. Own scope reaches the clients the person
-- manages, and documents they created themselves.
create function public.finance_reach(p_permission text, p_client uuid, p_created_by uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for(p_permission);
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;
  return (p_created_by is not null and p_created_by = v_actor)
    or exists (select 1 from public.clients c where c.id = p_client and c.client_manager_id = v_actor);
end;
$$;

create function public.can_manage_quotation_row(v_quotation public.quotations)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.finance_reach('quotations.manage', v_quotation.client_id, v_quotation.created_by)
$$;

create function public.can_view_quotation_row(v_quotation public.quotations)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.finance_reach('quotations.view', v_quotation.client_id, v_quotation.created_by)
    or public.can_manage_quotation_row(v_quotation)
$$;

create function public.can_view_quotation(p_quotation uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_quotation_row(q) from public.quotations q where q.id = p_quotation), false)
$$;

create function public.can_manage_invoice_row(v_invoice public.invoices)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.finance_reach('invoices.manage', v_invoice.client_id, v_invoice.created_by)
$$;

create function public.can_view_invoice_row(v_invoice public.invoices)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.finance_reach('invoices.view', v_invoice.client_id, v_invoice.created_by)
    or public.can_manage_invoice_row(v_invoice)
$$;

create function public.can_view_invoice(p_invoice uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_invoice_row(i) from public.invoices i where i.id = p_invoice), false)
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- True inside save_quotation, save_invoice and create_invoice_from_quotation, which
-- are the only places allowed to change totals.
create function public.finance_internal_write()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(current_setting('app.finance_internal', true), '') = 'on'
$$;

create function public.check_finance_links(p_client uuid, p_project uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_project is not null and not exists (
    select 1 from public.projects where id = p_project and client_id = p_client
  ) then
    raise exception 'Choose a project that belongs to this client.' using errcode = 'check_violation';
  end if;
end;
$$;

create function public.guard_quotation_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_internal boolean := public.finance_internal_write();
  v_settings public.finance_settings;
  v_client public.clients;
begin
  select * into v_settings from public.finance_settings;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.sent_at := null;
    new.decided_at := null;
    new.invoice_id := null;
    if not v_internal then
      new.subtotal := 0;
      new.tax_total := 0;
    end if;
    new.terms := coalesce(new.terms, v_settings.quotation_terms);
    perform public.check_finance_links(new.client_id, new.project_id);
  else
    if new.quotation_number is distinct from old.quotation_number
       or new.sent_at is distinct from old.sent_at
       or new.decided_at is distinct from old.decided_at
       or (new.invoice_id is distinct from old.invoice_id and not v_internal and pg_trigger_depth() < 2) then
      raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
    end if;
    if not v_internal then
      new.subtotal := old.subtotal;
      new.tax_total := old.tax_total;
    end if;

    if old.status not in ('draft', 'sent') and (
      new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id
      or new.title is distinct from old.title or new.issue_date is distinct from old.issue_date
      or new.valid_until is distinct from old.valid_until or new.bill_to_name is distinct from old.bill_to_name
      or new.bill_to_address is distinct from old.bill_to_address or new.client_gstin is distinct from old.client_gstin
      or new.place_of_supply is distinct from old.place_of_supply or new.notes is distinct from old.notes
      or new.terms is distinct from old.terms or new.subtotal is distinct from old.subtotal
      or new.tax_total is distinct from old.tax_total
    ) then
      raise exception 'Only a draft or sent quotation can be changed. Revise it first.' using errcode = 'check_violation';
    end if;

    if new.client_id is distinct from old.client_id
       and not public.finance_reach('quotations.manage', new.client_id, null) then
      raise exception 'You cannot prepare quotations for this client.' using errcode = 'insufficient_privilege';
    end if;
    if new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id then
      perform public.check_finance_links(new.client_id, new.project_id);
    end if;

    if new.status is distinct from old.status then
      if old.status = 'draft' and new.status = 'sent' then
        if old.subtotal + old.tax_total <= 0
           or not exists (select 1 from public.quotation_items where quotation_id = new.id) then
          raise exception 'Add at least one item with an amount before sending.' using errcode = 'check_violation';
        end if;
        new.sent_at := now();
      elsif old.status = 'sent' and new.status in ('accepted', 'declined') then
        new.decided_at := now();
      elsif (old.status in ('sent', 'declined') and new.status = 'draft')
            or (old.status = 'accepted' and new.status = 'sent' and old.invoice_id is null) then
        new.decided_at := null;
        if new.status = 'draft' then
          new.sent_at := null;
        end if;
      else
        raise exception 'You cannot move this quotation from % to %.', old.status, new.status
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or old.status in ('draft', 'sent') then
    select * into v_client from public.clients where id = new.client_id;
    new.bill_to_name := coalesce(nullif(trim(new.bill_to_name), ''), v_client.company_name);
    new.bill_to_address := coalesce(nullif(trim(new.bill_to_address), ''), v_client.address);
    new.client_gstin := coalesce(nullif(upper(trim(new.client_gstin)), ''), v_client.gstin);
    new.place_of_supply := coalesce(nullif(trim(new.place_of_supply), ''), v_client.billing_state);
    new.valid_until := coalesce(new.valid_until, new.issue_date + v_settings.quotation_validity_days);
  end if;
  return new;
end;
$$;

create trigger quotations_guard before insert or update on public.quotations
  for each row execute function public.guard_quotation_write();
create trigger quotations_split_tax before insert or update on public.quotations
  for each row execute function public.apply_gst_split();
create trigger quotations_stamp_created_by before insert or update on public.quotations
  for each row execute function public.stamp_created_by();

create function public.guard_invoice_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_internal boolean := public.finance_internal_write();
  v_settings public.finance_settings;
  v_client public.clients;
  v_year integer;
  v_financial_year text;
  v_number integer;
begin
  select * into v_settings from public.finance_settings;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.invoice_number := null;
    new.amount_paid := 0;
    new.issued_at := null;
    new.paid_at := null;
    new.cancelled_at := null;
    new.cancel_reason := null;
    if not v_internal then
      new.subtotal := 0;
      new.tax_total := 0;
      new.quotation_id := null;
    end if;
    new.terms := coalesce(new.terms, v_settings.invoice_terms);
    perform public.check_finance_links(new.client_id, new.project_id);
  elsif pg_trigger_depth() > 1 then
    -- Payments being recorded or removed. Only the paid amount and status move.
    return new;
  else
    if new.invoice_number is distinct from old.invoice_number
       or new.quotation_id is distinct from old.quotation_id
       or new.amount_paid is distinct from old.amount_paid
       or new.issued_at is distinct from old.issued_at
       or new.paid_at is distinct from old.paid_at
       or new.cancelled_at is distinct from old.cancelled_at
       or (new.cancel_reason is distinct from old.cancel_reason and not (new.status = 'cancelled' and old.status <> 'cancelled')) then
      raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
    end if;
    if not v_internal then
      new.subtotal := old.subtotal;
      new.tax_total := old.tax_total;
    end if;

    if old.status <> 'draft' and (
      new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id
      or new.title is distinct from old.title or new.issue_date is distinct from old.issue_date
      or new.due_date is distinct from old.due_date or new.bill_to_name is distinct from old.bill_to_name
      or new.bill_to_address is distinct from old.bill_to_address or new.client_gstin is distinct from old.client_gstin
      or new.place_of_supply is distinct from old.place_of_supply or new.notes is distinct from old.notes
      or new.terms is distinct from old.terms or new.subtotal is distinct from old.subtotal
      or new.tax_total is distinct from old.tax_total
    ) then
      raise exception 'An issued invoice cannot be changed. Cancel it and issue a new one if something is wrong.'
        using errcode = 'check_violation';
    end if;

    if new.client_id is distinct from old.client_id
       and not public.finance_reach('invoices.manage', new.client_id, null) then
      raise exception 'You cannot bill this client.' using errcode = 'insufficient_privilege';
    end if;
    if new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id then
      perform public.check_finance_links(new.client_id, new.project_id);
    end if;

    if new.status is distinct from old.status then
      if old.status = 'draft' and new.status = 'issued' then
        if old.subtotal + old.tax_total <= 0
           or not exists (select 1 from public.invoice_items where invoice_id = new.id) then
          raise exception 'Add at least one item with an amount before issuing.' using errcode = 'check_violation';
        end if;
        if new.issue_date > public.india_today() then
          raise exception 'The invoice date cannot be in the future.' using errcode = 'check_violation';
        end if;

        v_year := extract(year from new.issue_date)::integer
          - case when extract(month from new.issue_date) < 4 then 1 else 0 end;
        v_financial_year := lpad((v_year % 100)::text, 2, '0') || '-' || lpad(((v_year + 1) % 100)::text, 2, '0');
        insert into public.invoice_number_counters as c (financial_year, last_number)
        values (v_financial_year, 1)
        on conflict (financial_year) do update set last_number = c.last_number + 1
        returning last_number into v_number;

        new.invoice_number := v_settings.invoice_prefix || '/' || v_financial_year || '/' || lpad(v_number::text, 4, '0');
        new.issued_at := now();
      elsif old.status in ('issued', 'partially_paid', 'paid') and new.status = 'cancelled' then
        if old.amount_paid > 0 then
          raise exception 'Remove the payments recorded against this invoice before cancelling it.'
            using errcode = 'check_violation';
        end if;
        if coalesce(trim(new.cancel_reason), '') = '' then
          raise exception 'Give a reason for cancelling.' using errcode = 'check_violation';
        end if;
        new.cancelled_at := now();
      else
        raise exception 'You cannot move this invoice from % to %.',
          replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or old.status = 'draft' then
    select * into v_client from public.clients where id = new.client_id;
    new.bill_to_name := coalesce(nullif(trim(new.bill_to_name), ''), v_client.company_name);
    new.bill_to_address := coalesce(nullif(trim(new.bill_to_address), ''), v_client.address);
    new.client_gstin := coalesce(nullif(upper(trim(new.client_gstin)), ''), v_client.gstin);
    new.place_of_supply := coalesce(nullif(trim(new.place_of_supply), ''), v_client.billing_state);
    new.due_date := coalesce(new.due_date, new.issue_date + v_settings.payment_terms_days);
  end if;
  return new;
end;
$$;

create trigger invoices_guard before insert or update on public.invoices
  for each row execute function public.guard_invoice_write();
create trigger invoices_split_tax before insert or update on public.invoices
  for each row execute function public.apply_gst_split();
create trigger invoices_stamp_created_by before insert or update on public.invoices
  for each row execute function public.stamp_created_by();

create function public.guard_payment_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'Choose an invoice.' using errcode = 'check_violation';
  end if;
  if v_invoice.status not in ('issued', 'partially_paid') then
    raise exception 'Payments can only be recorded against an issued invoice that is not fully paid.'
      using errcode = 'check_violation';
  end if;
  if new.amount > v_invoice.total - v_invoice.amount_paid then
    raise exception 'This is more than the % still due.', public.format_rupees(v_invoice.total - v_invoice.amount_paid)
      using errcode = 'check_violation';
  end if;
  if new.payment_date > public.india_today() then
    raise exception 'The payment date cannot be in the future.' using errcode = 'check_violation';
  end if;

  new.client_id := v_invoice.client_id;
  if (select auth.uid()) is not null then
    new.recorded_by := public.current_employee_id();
  end if;
  return new;
end;
$$;

create trigger payments_guard before insert on public.payments
  for each row execute function public.guard_payment_insert();

-- Keeps the invoice's paid amount and status in step with its payments.
create function public.refresh_invoice_payments()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_invoice;

  update public.invoices
  set amount_paid = v_paid,
      status = case when v_paid >= total then 'paid' when v_paid > 0 then 'partially_paid' else 'issued' end::public.invoice_status,
      paid_at = case when v_paid >= total then coalesce(paid_at, now()) end
  where id = v_invoice and status in ('issued', 'partially_paid', 'paid');
  return null;
end;
$$;

create trigger payments_refresh_invoice after insert or delete on public.payments
  for each row execute function public.refresh_invoice_payments();

-- ---------------------------------------------------------------------------
-- Saving documents with their items
-- ---------------------------------------------------------------------------

-- Checks the items and rounds every figure to two decimal places, so the stored
-- lines and the totals worked out from them always agree.
create function public.normalize_items(p_items jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Use 100 items or fewer.' using errcode = 'check_violation';
  end if;

  select jsonb_agg(jsonb_build_object(
      'position', x.position,
      'description', trim(x.item ->> 'description'),
      'hsn_sac', nullif(trim(x.item ->> 'hsn_sac'), ''),
      'quantity', round((x.item ->> 'quantity')::numeric, 2),
      'unit_price', round((x.item ->> 'unit_price')::numeric, 2),
      'tax_rate', round((x.item ->> 'tax_rate')::numeric, 2)
    ) order by x.position)
    into v_items
  from jsonb_array_elements(p_items) with ordinality as x (item, position);
  return v_items;
end;
$$;

-- The lines of a normalised item list, with their amounts.
create function public.item_lines(p_items jsonb)
returns table (
  "position" integer, description text, hsn_sac text, quantity numeric, unit_price numeric,
  tax_rate numeric, taxable_amount numeric, tax_amount numeric
)
language sql immutable set search_path = ''
as $$
  select (e ->> 'position')::integer, e ->> 'description', e ->> 'hsn_sac',
    (e ->> 'quantity')::numeric, (e ->> 'unit_price')::numeric, (e ->> 'tax_rate')::numeric,
    public.line_taxable_amount((e ->> 'quantity')::numeric, (e ->> 'unit_price')::numeric),
    public.line_tax_amount(
      public.line_taxable_amount((e ->> 'quantity')::numeric, (e ->> 'unit_price')::numeric),
      (e ->> 'tax_rate')::numeric)
  from jsonb_array_elements(p_items) as e
$$;

-- Creates or updates a quotation and replaces its items in one step. Items look like
-- {"description", "hsn_sac", "quantity", "unit_price", "tax_rate"}.
create function public.save_quotation(p_quotation uuid, p_values jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.quotations;
  v_id uuid := p_quotation;
  v_client uuid := (p_values ->> 'client_id')::uuid;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
begin
  if public.current_employee_id() is null then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  v_items := public.normalize_items(p_items);
  select coalesce(sum(l.taxable_amount), 0), coalesce(sum(l.tax_amount), 0)
    into v_subtotal, v_tax
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'on', true);

  if v_id is null then
    if not public.finance_reach('quotations.manage', v_client, null) then
      raise exception 'You cannot prepare quotations for this client.' using errcode = 'insufficient_privilege';
    end if;
    insert into public.quotations (
      client_id, project_id, title, issue_date, valid_until, bill_to_name, bill_to_address,
      client_gstin, place_of_supply, notes, terms, subtotal, tax_total
    ) values (
      v_client, (p_values ->> 'project_id')::uuid, p_values ->> 'title',
      coalesce((p_values ->> 'issue_date')::date, public.india_today()), (p_values ->> 'valid_until')::date,
      p_values ->> 'bill_to_name', p_values ->> 'bill_to_address', p_values ->> 'client_gstin',
      p_values ->> 'place_of_supply', p_values ->> 'notes', p_values ->> 'terms', v_subtotal, v_tax
    )
    returning id into v_id;
  else
    select * into v_existing from public.quotations where id = v_id for update;
    if not found or not public.can_manage_quotation_row(v_existing) then
      raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
    end if;
    if v_existing.status not in ('draft', 'sent') then
      raise exception 'Only a draft or sent quotation can be changed. Revise it first.' using errcode = 'check_violation';
    end if;
    update public.quotations set
      client_id = v_client,
      project_id = (p_values ->> 'project_id')::uuid,
      title = p_values ->> 'title',
      issue_date = coalesce((p_values ->> 'issue_date')::date, issue_date),
      valid_until = (p_values ->> 'valid_until')::date,
      bill_to_name = p_values ->> 'bill_to_name',
      bill_to_address = p_values ->> 'bill_to_address',
      client_gstin = p_values ->> 'client_gstin',
      place_of_supply = p_values ->> 'place_of_supply',
      notes = p_values ->> 'notes',
      terms = p_values ->> 'terms',
      subtotal = v_subtotal,
      tax_total = v_tax
    where id = v_id;
    delete from public.quotation_items where quotation_id = v_id;
  end if;

  insert into public.quotation_items (
    quotation_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount
  )
  select v_id, l.position, l.description, l.hsn_sac, l.quantity, l.unit_price, l.tax_rate, l.taxable_amount, l.tax_amount
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

create function public.save_invoice(p_invoice uuid, p_values jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.invoices;
  v_id uuid := p_invoice;
  v_client uuid := (p_values ->> 'client_id')::uuid;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
begin
  if public.current_employee_id() is null then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  v_items := public.normalize_items(p_items);
  select coalesce(sum(l.taxable_amount), 0), coalesce(sum(l.tax_amount), 0)
    into v_subtotal, v_tax
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'on', true);

  if v_id is null then
    if not public.finance_reach('invoices.manage', v_client, null) then
      raise exception 'You cannot bill this client.' using errcode = 'insufficient_privilege';
    end if;
    insert into public.invoices (
      client_id, project_id, title, issue_date, due_date, bill_to_name, bill_to_address,
      client_gstin, place_of_supply, notes, terms, subtotal, tax_total
    ) values (
      v_client, (p_values ->> 'project_id')::uuid, p_values ->> 'title',
      coalesce((p_values ->> 'issue_date')::date, public.india_today()), (p_values ->> 'due_date')::date,
      p_values ->> 'bill_to_name', p_values ->> 'bill_to_address', p_values ->> 'client_gstin',
      p_values ->> 'place_of_supply', p_values ->> 'notes', p_values ->> 'terms', v_subtotal, v_tax
    )
    returning id into v_id;
  else
    select * into v_existing from public.invoices where id = v_id for update;
    if not found or not public.can_manage_invoice_row(v_existing) then
      raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'An issued invoice cannot be changed. Cancel it and issue a new one if something is wrong.'
        using errcode = 'check_violation';
    end if;
    update public.invoices set
      client_id = v_client,
      project_id = (p_values ->> 'project_id')::uuid,
      title = p_values ->> 'title',
      issue_date = coalesce((p_values ->> 'issue_date')::date, issue_date),
      due_date = (p_values ->> 'due_date')::date,
      bill_to_name = p_values ->> 'bill_to_name',
      bill_to_address = p_values ->> 'bill_to_address',
      client_gstin = p_values ->> 'client_gstin',
      place_of_supply = p_values ->> 'place_of_supply',
      notes = p_values ->> 'notes',
      terms = p_values ->> 'terms',
      subtotal = v_subtotal,
      tax_total = v_tax
    where id = v_id;
    delete from public.invoice_items where invoice_id = v_id;
  end if;

  insert into public.invoice_items (
    invoice_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount
  )
  select v_id, l.position, l.description, l.hsn_sac, l.quantity, l.unit_price, l.tax_rate, l.taxable_amount, l.tax_amount
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

-- Turns an accepted quotation into a draft invoice with the same items.
create function public.create_invoice_from_quotation(p_quotation uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_quotation public.quotations;
  v_id uuid;
begin
  select * into v_quotation from public.quotations where id = p_quotation for update;
  if not found or not public.can_view_quotation_row(v_quotation) then
    raise exception 'Quotation not found.' using errcode = 'insufficient_privilege';
  end if;
  if v_quotation.status <> 'accepted' then
    raise exception 'Only an accepted quotation can be turned into an invoice.' using errcode = 'check_violation';
  end if;
  if v_quotation.invoice_id is not null then
    raise exception 'This quotation already has an invoice.' using errcode = 'check_violation';
  end if;
  if not public.finance_reach('invoices.manage', v_quotation.client_id, null) then
    raise exception 'You cannot bill this client.' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.finance_internal', 'on', true);

  insert into public.invoices (
    client_id, project_id, quotation_id, title, bill_to_name, bill_to_address, client_gstin,
    place_of_supply, notes, subtotal, tax_total
  ) values (
    v_quotation.client_id, v_quotation.project_id, v_quotation.id, v_quotation.title,
    v_quotation.bill_to_name, v_quotation.bill_to_address, v_quotation.client_gstin,
    v_quotation.place_of_supply, v_quotation.notes, v_quotation.subtotal, v_quotation.tax_total
  )
  returning id into v_id;

  insert into public.invoice_items (
    invoice_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount
  )
  select v_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount
  from public.quotation_items where quotation_id = p_quotation;

  update public.quotations set invoice_id = v_id where id = p_quotation;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create function public.notify_payment_received()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_manager uuid;
  v_title text;
  v_body text;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id;
  select client_manager_id into v_manager from public.clients where id = v_invoice.client_id;

  v_title := case when v_invoice.amount_paid + new.amount >= v_invoice.total
    then 'An invoice is paid in full' else 'A payment was received' end;
  v_body := public.format_rupees(new.amount) || ' for ' || v_invoice.invoice_number || ': ' || v_invoice.title;

  perform public.notify(v_manager, 'payment_received', v_title, v_body, '/invoices/' || v_invoice.id);
  if v_invoice.created_by is distinct from v_manager then
    perform public.notify(v_invoice.created_by, 'payment_received', v_title, v_body, '/invoices/' || v_invoice.id);
  end if;
  return null;
end;
$$;

create trigger payments_notify after insert on public.payments
  for each row execute function public.notify_payment_received();

-- Runs every hour and tells the Client Manager and whoever raised the invoice, once,
-- when an invoice passes its due date unpaid.
create function public.send_invoice_overdue_reminders()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice record;
  v_person uuid;
begin
  for v_invoice in
    select i.id, i.invoice_number, i.total - i.amount_paid as balance, i.due_date, i.created_by,
      c.client_manager_id, c.company_name
    from public.invoices i
    join public.clients c on c.id = i.client_id
    where i.status in ('issued', 'partially_paid') and i.due_date < public.india_today()
  loop
    for v_person in
      select distinct person from (values (v_invoice.client_manager_id), (v_invoice.created_by)) as p (person)
      where person is not null
    loop
      perform public.notify(v_person, 'invoice_overdue', 'An invoice is overdue',
        v_invoice.invoice_number || ' for ' || v_invoice.company_name || ': ' || public.format_rupees(v_invoice.balance)
          || ' was due ' || to_char(v_invoice.due_date, 'DD Mon YYYY'),
        '/invoices/' || v_invoice.id, 'high', null,
        'invoice-overdue:' || v_invoice.id || ':' || v_invoice.due_date);
    end loop;
  end loop;
end;
$$;

select cron.schedule('send-invoice-overdue-reminders', '30 * * * *', $$select public.send_invoice_overdue_reminders()$$);

-- ---------------------------------------------------------------------------
-- Audit and the Client 360 timeline
-- ---------------------------------------------------------------------------

-- As before, with readable labels for quotations, invoices and payments.
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_details jsonb;
  v_action text;
  v_label text;
  v_client text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_details := jsonb_build_object('deleted', v_row);
    v_action := 'deleted';
  elsif tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_details := jsonb_build_object('created', v_row);
    v_action := 'created';
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    select jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value))
      into v_details
    from jsonb_each(v_new) n
    where n.key <> 'updated_at' and n.value is distinct from v_old -> n.key;
    if v_details is null then
      return new;
    end if;
    v_details := jsonb_build_object('changes', v_details);
    v_action := 'updated';
  end if;

  if v_actor is not null then
    select full_name into v_actor_name from public.employees where id = v_actor;
  end if;

  -- The name is copied in, so an entry stays readable if the record later changes.
  v_label := coalesce(
    v_row ->> 'full_name', v_row ->> 'company_name', v_row ->> 'name',
    v_row ->> 'title', v_row ->> 'service_name'
  );
  if tg_table_name = 'role_permissions' then
    select r.name || ': ' || (v_row ->> 'permission_key') into v_label
    from public.roles r
    where r.id = (v_row ->> 'role_id')::uuid;
  elsif tg_table_name = 'invoices' then
    v_label := coalesce(v_row ->> 'invoice_number', 'draft') || ': ' || (v_row ->> 'title');
  elsif tg_table_name = 'quotations' then
    v_label := (v_row ->> 'quotation_number') || ': ' || (v_row ->> 'title');
  elsif tg_table_name = 'payments' then
    v_label := public.format_rupees((v_row ->> 'amount')::numeric);
  end if;
  v_details := v_details || jsonb_build_object('label', v_label);

  v_client := coalesce(v_row ->> 'client_id', case when tg_table_name = 'clients' then v_row ->> 'id' end);

  insert into public.audit_logs (
    actor_employee_id, actor_name, action, entity_type, entity_id, client_id, details
  )
  values (
    v_actor,
    coalesce(v_actor_name, 'System'),
    v_action,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'role_id', v_row ->> 'project_id'),
    v_client::uuid,
    v_details
  );

  return coalesce(new, old);
end;
$$;

-- As before, but money entries only show to people who may see that client's money.
create or replace function public.get_client_timeline(p_client uuid, p_limit integer default 100)
returns table (
  id bigint, actor_name text, action text, entity_type text, details jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_quotations boolean;
  v_invoices boolean;
begin
  if not public.can_view_client(p_client) then
    return;
  end if;
  v_quotations := public.finance_reach('quotations.view', p_client, null)
    or public.finance_reach('quotations.manage', p_client, null);
  v_invoices := public.finance_reach('invoices.view', p_client, null)
    or public.finance_reach('invoices.manage', p_client, null);

  return query
  select a.id, a.actor_name, a.action, a.entity_type,
    jsonb_build_object(
      'label', a.details -> 'label',
      'changes', (
        select jsonb_object_agg(key, true)
        from jsonb_object_keys(coalesce(a.details -> 'changes', '{}'::jsonb)) as key
      )
    ),
    a.created_at
  from public.audit_logs a
  where a.client_id = p_client
    and (a.entity_type <> 'quotations' or v_quotations)
    and (a.entity_type not in ('invoices', 'payments') or v_invoices)
  order by a.id desc
  limit least(p_limit, 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger finance_settings_set_updated_at before update on public.finance_settings
  for each row execute function public.set_updated_at();
create trigger quotations_set_updated_at before update on public.quotations
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger finance_settings_audit after update on public.finance_settings
  for each row execute function public.audit_row_change();
create trigger quotations_audit after insert or update or delete on public.quotations
  for each row execute function public.audit_row_change();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.audit_row_change();
create trigger payments_audit after insert or delete on public.payments
  for each row execute function public.audit_row_change();

alter table public.finance_settings enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_number_counters enable row level security;
alter table public.payments enable row level security;

-- Billing details are printed on every quotation and invoice.
create policy finance_settings_select on public.finance_settings for select to authenticated
  using (
    public.has_permission('quotations.view') or public.has_permission('quotations.manage')
    or public.has_permission('invoices.view') or public.has_permission('invoices.manage')
    or public.has_permission('finance.manage')
  );
create policy finance_settings_update on public.finance_settings for update to authenticated
  using (public.permission_scope_for('finance.manage') = 'organisation')
  with check (public.permission_scope_for('finance.manage') = 'organisation');

create policy quotations_select on public.quotations for select to authenticated
  using (public.can_view_quotation_row(quotations));
create policy quotations_insert on public.quotations for insert to authenticated
  with check (public.finance_reach('quotations.manage', client_id, null));
-- Field and status rules are applied by guard_quotation_write.
create policy quotations_update on public.quotations for update to authenticated
  using (public.can_manage_quotation_row(quotations))
  with check (public.current_employee_id() is not null);
create policy quotations_delete on public.quotations for delete to authenticated
  using (public.can_manage_quotation_row(quotations) and status = 'draft');

create policy quotation_items_select on public.quotation_items for select to authenticated
  using (public.can_view_quotation(quotation_id));

create policy invoices_select on public.invoices for select to authenticated
  using (public.can_view_invoice_row(invoices));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (public.finance_reach('invoices.manage', client_id, null));
-- Field and status rules are applied by guard_invoice_write.
create policy invoices_update on public.invoices for update to authenticated
  using (public.can_manage_invoice_row(invoices))
  with check (public.current_employee_id() is not null);
create policy invoices_delete on public.invoices for delete to authenticated
  using (public.can_manage_invoice_row(invoices) and status = 'draft');

create policy invoice_items_select on public.invoice_items for select to authenticated
  using (public.can_view_invoice(invoice_id));

create policy payments_select on public.payments for select to authenticated
  using (public.can_view_invoice(invoice_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_permission('payments.record') and public.can_view_invoice(invoice_id));
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_permission('payments.record'));
