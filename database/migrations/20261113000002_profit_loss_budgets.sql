-- Stage 11 of the HR and Finance build: profit and loss, and department budgets.
--
-- * Profit and loss is cash basis: income is invoice payments received plus other
--   income; expenses are expense entries (salaries, settlements, reimbursements, vendor
--   bills and everything entered by hand). Removed entries do not count. It is worked out
--   from money_movements, the one list of every movement, so nothing is counted twice.
-- * A budget is set per department for a month or a financial year (April to March).
--   Spent is the department's expenses in that period. Finance and the department head
--   are told once at 80% and once at 100%.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('budgets.manage', 'Finance', 'Manage department budgets', 'Set department budgets and see how much of each is spent.', '{organisation}', 1098);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'budgets.manage', 'organisation'
from public.roles r
where r.name in ('Founder', 'Finance Head')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- Profit and loss
-- ---------------------------------------------------------------------------

-- Money in and out in the range, by month, section and line, with the department for
-- expenses. Sections: revenue, salaries (salaries and full and final settlements) and
-- operating (every other expense). Read with the viewer's own access.
create function public.get_profit_loss(p_from date, p_to date)
returns table (month date, section text, label text, department_name text, amount numeric)
language plpgsql stable set search_path = ''
as $$
begin
  if not public.can_see_ledger() then
    raise exception 'You do not have permission to see profit and loss.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select date_trunc('month', m.occurred_on)::date,
         case when m.direction = 'in' then 'revenue'
              when f.system_key in ('salaries', 'settlements') then 'salaries'
              else 'operating' end,
         case when m.kind = 'invoice_payment' then 'Invoice payments' else coalesce(f.name, 'Uncategorised') end,
         case when m.direction = 'out' then coalesce(d.name, 'No department') end,
         sum(m.amount)
  from public.money_movements m
  left join public.finance_categories f on f.id = m.category_id
  left join public.departments d on d.id = m.department_id
  where m.occurred_on between p_from and p_to
  group by 1, 2, 3, 4
  order by 1, 2, 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- Department budgets
-- ---------------------------------------------------------------------------

create function public.can_manage_budgets()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('budgets.manage')
$$;

create table public.department_budgets (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  period_kind text not null check (period_kind in ('month', 'year')),
  -- The first day of the month, or 1 April for a financial year.
  period_start date not null,
  amount numeric(14, 2) not null check (amount > 0),
  notes text check (length(notes) <= 500),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_budgets_start check (
    extract(day from period_start) = 1 and (period_kind = 'month' or extract(month from period_start) = 4)
  ),
  unique (department_id, period_kind, period_start)
);

-- Which warnings a budget has already sent, so each is sent once.
create table public.budget_alerts (
  budget_id uuid not null references public.department_budgets (id) on delete cascade,
  threshold integer not null check (threshold in (80, 100)),
  sent_at timestamptz not null default now(),
  primary key (budget_id, threshold)
);

create function public.budget_period_end(p_kind text, p_start date)
returns date
language sql immutable set search_path = ''
as $$
  select (p_start + case when p_kind = 'year' then interval '1 year' else interval '1 month' end - interval '1 day')::date
$$;

create function public.budget_spent(p_department uuid, p_from date, p_to date)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(e.amount), 0)
  from public.expense_records e
  where e.department_id = p_department and e.deleted_at is null and e.spent_on between p_from and p_to
$$;

-- Every budget whose period touches the range, with what has been spent.
create function public.get_budget_usage(p_from date, p_to date)
returns table (
  budget_id uuid, department_id uuid, department_name text, period_kind text, period_start date, period_end date,
  amount numeric, spent numeric, remaining numeric, utilisation numeric, notes text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_manage_budgets() then
    raise exception 'You do not have permission to see budgets.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select b.id, b.department_id, d.name, b.period_kind, b.period_start, public.budget_period_end(b.period_kind, b.period_start),
         b.amount, s.spent, b.amount - s.spent, round(s.spent / b.amount * 100, 1), b.notes
  from public.department_budgets b
  join public.departments d on d.id = b.department_id
  cross join lateral (select public.budget_spent(b.department_id, b.period_start, public.budget_period_end(b.period_kind, b.period_start)) as spent) s
  where b.period_start <= p_to and public.budget_period_end(b.period_kind, b.period_start) >= p_from
  order by b.period_start, b.period_kind, d.name;
end;
$$;

-- notify() leaves out whoever caused the event. A budget warning goes to them too: in
-- practice the Finance person enters most expenses and must still hear that a budget is
-- used up. The notifications trigger still applies preferences and push.
create function public.notify_budget(p_recipient uuid, p_title text, p_body text, p_link text, p_priority public.notification_priority)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
begin
  if p_recipient is null or not exists (select 1 from public.employees where id = p_recipient and is_active) then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, priority, title, body, link, actor_id, actor_name)
  values (p_recipient, 'budget_alert', p_priority, p_title, left(p_body, 300), p_link, v_actor,
          (select full_name from public.employees where id = v_actor));
end;
$$;

-- Warns Finance and the department head the first time a budget reaches 80% and 100%.
-- Lowering the spending or raising the budget lets a warning be sent again later.
create function public.check_budget_alerts(p_department uuid, p_on date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_budget record;
  v_spent numeric;
  v_threshold integer;
  v_person uuid;
  v_head uuid;
  v_title text;
  v_body text;
  v_period text;
begin
  for v_budget in
    select b.*, d.name as department_name, d.head_employee_id, public.budget_period_end(b.period_kind, b.period_start) as period_end
    from public.department_budgets b join public.departments d on d.id = b.department_id
    where b.department_id = p_department and p_on between b.period_start and public.budget_period_end(b.period_kind, b.period_start)
  loop
    v_spent := public.budget_spent(v_budget.department_id, v_budget.period_start, v_budget.period_end);
    delete from public.budget_alerts a where a.budget_id = v_budget.id and v_spent < v_budget.amount * a.threshold / 100;

    v_threshold := case when v_spent >= v_budget.amount then 100 when v_spent >= v_budget.amount * 0.8 then 80 end;
    if v_threshold is null or exists (select 1 from public.budget_alerts where budget_id = v_budget.id and threshold >= v_threshold) then
      continue;
    end if;
    insert into public.budget_alerts (budget_id, threshold) select v_budget.id, t from unnest(array[80, 100]) as t where t <= v_threshold
    on conflict do nothing;

    v_period := case when v_budget.period_kind = 'year'
      then 'financial year ' || public.financial_year_label(v_budget.period_start)
      else to_char(v_budget.period_start, 'FMMonth YYYY') end;
    v_title := case when v_threshold = 100 then v_budget.department_name || ' is over budget' else v_budget.department_name || ' has used 80% of its budget' end;
    v_body := public.format_rupees(v_spent) || ' spent of ' || public.format_rupees(v_budget.amount) || ' for ' || v_period || '.';

    for v_person in select id from public.employees_with_permission('budgets.manage', 'organisation') as f (id) loop
      perform public.notify_budget(v_person, v_title, v_body, '/finance/budgets',
        case when v_threshold = 100 then 'high' else 'normal' end::public.notification_priority);
    end loop;
    v_head := v_budget.head_employee_id;
    if v_head is not null and not exists (select 1 from public.employees_with_permission('budgets.manage', 'organisation') as f (id) where f.id = v_head) then
      perform public.notify_budget(v_head, v_title, v_body, '/overview',
        case when v_threshold = 100 then 'high' else 'normal' end::public.notification_priority);
    end if;
  end loop;
end;
$$;

create function public.check_budget_after_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.department_id is not null then
    perform public.check_budget_alerts(new.department_id, new.spent_on);
  end if;
  if tg_op = 'UPDATE' and old.department_id is not null
     and (old.department_id is distinct from new.department_id or old.spent_on is distinct from new.spent_on) then
    perform public.check_budget_alerts(old.department_id, old.spent_on);
  end if;
  return null;
end;
$$;

create trigger expense_records_check_budget after insert or update of amount, department_id, spent_on, deleted_at on public.expense_records
  for each row execute function public.check_budget_after_expense();

create function public.check_budget_after_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.check_budget_alerts(new.department_id, new.period_start);
  return null;
end;
$$;

create trigger department_budgets_check after insert or update of amount, department_id, period_kind, period_start on public.department_budgets
  for each row execute function public.check_budget_after_change();

create trigger department_budgets_stamp before insert on public.department_budgets
  for each row execute function public.stamp_recruitment_row();
create trigger department_budgets_set_updated_at before update on public.department_budgets
  for each row execute function public.set_updated_at();
create trigger department_budgets_audit after insert or update or delete on public.department_budgets
  for each row execute function public.audit_row_change();

alter table public.department_budgets enable row level security;
alter table public.budget_alerts enable row level security;

create policy department_budgets_select on public.department_budgets for select to authenticated using (public.can_manage_budgets());
create policy department_budgets_write on public.department_budgets for all to authenticated
  using (public.can_manage_budgets()) with check (public.can_manage_budgets());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.department_budgets to authenticated;
grant execute on function public.get_profit_loss(date, date) to authenticated;
grant execute on function public.get_budget_usage(date, date) to authenticated;
grant execute on function public.can_manage_budgets() to authenticated;
grant execute on function public.budget_period_end(text, date) to authenticated;
