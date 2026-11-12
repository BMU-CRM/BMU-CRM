-- Stage 8 of the HR and Finance build: payment follow-ups, receipts and reminders.
--
-- * Follow-ups on unpaid invoices, as a history of notes per invoice. The status shown is
--   the latest note's, or "payment received" once the invoice is fully paid.
-- * Receipt numbers for invoice payments, in a series per financial year like invoices
--   (RCPT/26-27/0001), given when the payment is recorded. Existing payments are numbered
--   in date order.
-- * Reminders to Finance: invoices due in three days, and follow-ups due today. The
--   existing overdue reminder carries on as before.
-- Invoices themselves are not changed.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('followups.manage', 'Finance', 'Follow up on payments',
   'See every unpaid invoice, record follow-ups with clients and get reminders.', '{organisation}', 1045);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'followups.manage', 'organisation'
from public.roles r
where r.name in ('Founder', 'Finance Head')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------------

create type public.follow_up_status as enum ('not_contacted', 'pending', 'contacted', 'promise_to_pay', 'payment_received');

create table public.invoice_follow_ups (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  status public.follow_up_status not null,
  note text not null check (length(trim(note)) between 2 and 2000),
  contacted_on date not null default public.india_today(),
  next_follow_up_on date,
  promised_amount numeric(14, 2) check (promised_amount > 0),
  promised_on date,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invoice_follow_ups_manual check (status not in ('not_contacted', 'payment_received'))
);
create index invoice_follow_ups_invoice_idx on public.invoice_follow_ups (invoice_id, created_at desc);
create index invoice_follow_ups_next_idx on public.invoice_follow_ups (next_follow_up_on);

create function public.guard_follow_up()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := public.current_employee_id();
  end if;
  if not exists (select 1 from public.invoices where id = new.invoice_id and status in ('issued', 'partially_paid')) then
    raise exception 'Follow-ups are for issued invoices that are not fully paid.' using errcode = 'check_violation';
  end if;
  if new.contacted_on > public.india_today() then
    raise exception 'The contact date cannot be in the future.' using errcode = 'check_violation';
  end if;
  if new.next_follow_up_on is not null and new.next_follow_up_on < new.contacted_on then
    raise exception 'The next follow-up must be after this one.' using errcode = 'check_violation';
  end if;
  if new.status = 'promise_to_pay' and new.promised_on is null then
    raise exception 'Enter the date they promised to pay by.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger invoice_follow_ups_guard before insert on public.invoice_follow_ups
  for each row execute function public.guard_follow_up();

-- Unpaid invoices with where each follow-up stands, for the follow-ups page. Read with
-- the person's own access to invoices.
create function public.get_follow_up_board(p_status public.follow_up_status default null, p_search text default null, p_include_paid boolean default false)
returns table (
  invoice_id uuid, invoice_number text, title text, client_id uuid, client_name text, client_manager text,
  total numeric, amount_paid numeric, balance numeric, due_date date, days_overdue integer,
  status public.follow_up_status, last_contacted_on date, next_follow_up_on date, last_note text,
  promised_on date, follow_up_count bigint
)
language plpgsql stable set search_path = ''
as $$
begin
  if not public.has_permission('followups.manage') then
    raise exception 'You do not have permission to see follow-ups.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select i.id, i.invoice_number, i.title, i.client_id, c.company_name, m.full_name,
         i.total, i.amount_paid, i.total - i.amount_paid, i.due_date,
         greatest(public.india_today() - i.due_date, 0),
         case when i.status = 'paid' then 'payment_received'::public.follow_up_status
              else coalesce(f.status, 'not_contacted'::public.follow_up_status) end,
         f.contacted_on, f.next_follow_up_on, f.note, f.promised_on,
         (select count(*) from public.invoice_follow_ups x where x.invoice_id = i.id)
  from public.invoices i
  join public.clients c on c.id = i.client_id
  left join public.employees m on m.id = c.client_manager_id
  left join lateral (
    select * from public.invoice_follow_ups x where x.invoice_id = i.id order by x.contacted_on desc, x.created_at desc limit 1
  ) f on true
  where (i.status in ('issued', 'partially_paid')
         or (p_include_paid and i.status = 'paid' and exists (select 1 from public.invoice_follow_ups x where x.invoice_id = i.id)))
    and (p_search is null or p_search = '' or c.company_name ilike '%' || p_search || '%' or i.invoice_number ilike '%' || p_search || '%')
    and (p_status is null or (case when i.status = 'paid' then 'payment_received'::public.follow_up_status
                                   else coalesce(f.status, 'not_contacted'::public.follow_up_status) end) = p_status)
  order by i.due_date, i.invoice_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Receipts
-- ---------------------------------------------------------------------------

alter table public.finance_settings
  add column receipt_prefix text not null default 'RCPT' check (receipt_prefix ~ '^[A-Z0-9]{1,5}$');

create table public.receipt_number_counters (
  financial_year text primary key,
  last_number integer not null
);

alter table public.payments add column receipt_number text unique;

create function public.financial_year_label(p_date date)
returns text
language sql immutable set search_path = ''
as $$
  select lpad(((extract(year from p_date)::integer - case when extract(month from p_date) < 4 then 1 else 0 end) % 100)::text, 2, '0')
    || '-' || lpad(((extract(year from p_date)::integer - case when extract(month from p_date) < 4 then 1 else 0 end + 1) % 100)::text, 2, '0')
$$;

create function public.next_receipt_number(p_date date)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_year text := public.financial_year_label(p_date);
  v_number integer;
  v_prefix text;
begin
  select receipt_prefix into v_prefix from public.finance_settings;
  insert into public.receipt_number_counters as c (financial_year, last_number) values (v_year, 1)
  on conflict (financial_year) do update set last_number = c.last_number + 1
  returning last_number into v_number;
  return coalesce(v_prefix, 'RCPT') || '/' || v_year || '/' || lpad(v_number::text, 4, '0');
end;
$$;

create function public.number_payment_receipt()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.receipt_number := public.next_receipt_number(new.payment_date);
  return new;
end;
$$;

create trigger payments_number_receipt before insert on public.payments
  for each row execute function public.number_payment_receipt();

-- Payments recorded before receipts existed get numbers in date order.
do $$
declare
  v_payment record;
begin
  for v_payment in select id, payment_date from public.payments where receipt_number is null order by payment_date, created_at loop
    update public.payments set receipt_number = public.next_receipt_number(v_payment.payment_date) where id = v_payment.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

-- Each morning: invoices due in three days, to Finance and the Client Manager; and
-- follow-ups due today or missed, to whoever logged them (or Finance).
create function public.send_follow_up_reminders()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice record;
  v_person uuid;
  v_today date := public.india_today();
begin
  for v_invoice in
    select i.id, i.invoice_number, i.total - i.amount_paid as balance, i.due_date, c.company_name, c.client_manager_id
    from public.invoices i join public.clients c on c.id = i.client_id
    where i.status in ('issued', 'partially_paid') and i.due_date = v_today + 3
  loop
    for v_person in
      select id from public.employees_with_permission('followups.manage', 'organisation') as f (id)
      union select v_invoice.client_manager_id where v_invoice.client_manager_id is not null
    loop
      perform public.notify(v_person, 'invoice_due_soon', 'An invoice is due in 3 days',
        v_invoice.invoice_number || ': ' || v_invoice.company_name || ', ' || public.format_rupees(v_invoice.balance) || ' due',
        '/invoices/' || v_invoice.id, 'normal', null, 'invoice-due-soon:' || v_invoice.id || ':' || v_invoice.due_date);
    end loop;
  end loop;

  for v_invoice in
    select i.id, i.invoice_number, c.company_name, f.next_follow_up_on, f.created_by, f.note
    from public.invoices i
    join public.clients c on c.id = i.client_id
    join lateral (
      select * from public.invoice_follow_ups x where x.invoice_id = i.id order by x.contacted_on desc, x.created_at desc limit 1
    ) f on true
    where i.status in ('issued', 'partially_paid') and f.next_follow_up_on <= v_today
  loop
    for v_person in
      select v_invoice.created_by where v_invoice.created_by is not null
      union select id from public.employees_with_permission('followups.manage', 'organisation') as f (id) where v_invoice.created_by is null
    loop
      perform public.notify(v_person, 'follow_up_due', 'Follow up on a payment today',
        v_invoice.invoice_number || ': ' || v_invoice.company_name || '. Last note: ' || v_invoice.note,
        '/finance/follow-ups/' || v_invoice.id, 'normal', null, 'follow-up:' || v_invoice.id || ':' || v_today);
    end loop;
  end loop;
end;
$$;

-- 09:00 in India.
select cron.schedule('send-follow-up-reminders', '30 3 * * *', $$select public.send_follow_up_reminders()$$);

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger invoice_follow_ups_audit after insert on public.invoice_follow_ups
  for each row execute function public.audit_row_change();

alter table public.invoice_follow_ups enable row level security;
alter table public.receipt_number_counters enable row level security;

-- Finance, and whoever can see the invoice's money (such as its Client Manager), see
-- the notes. Finance records them.
create policy invoice_follow_ups_select on public.invoice_follow_ups for select to authenticated
  using (public.has_permission('followups.manage') or public.can_view_invoice(invoice_id));
create policy invoice_follow_ups_insert on public.invoice_follow_ups for insert to authenticated
  with check (public.has_permission('followups.manage') and public.can_view_invoice(invoice_id));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert on public.invoice_follow_ups to authenticated;
grant execute on function public.get_follow_up_board(public.follow_up_status, text, boolean) to authenticated;
grant execute on function public.financial_year_label(date) to authenticated;
