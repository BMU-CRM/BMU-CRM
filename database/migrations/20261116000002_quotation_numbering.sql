-- Quotation numbers the owner can set (Settings, Finance settings):
-- * a prefix, so QUO-0009 can become, for example, BMU-0009;
-- * the next number, so numbering can continue from another system or skip test numbers.
-- Numbers already given are never changed. A number already in use is skipped, so two
-- quotations never share one.

alter table public.finance_settings
  add column quotation_prefix text not null default 'QUO' check (quotation_prefix ~ '^[A-Z0-9]{1,8}$');

-- The next number to give. One row, read and changed only through the functions below.
create table public.quotation_number_counter (
  id boolean primary key default true check (id),
  next_number integer not null check (next_number between 1 and 999999)
);
insert into public.quotation_number_counter (next_number)
select case when is_called then last_value + 1 else last_value end from public.quotation_code_sequence;
alter table public.quotation_number_counter enable row level security;
revoke all on public.quotation_number_counter from public, anon, authenticated;

-- Numbers are given by the trigger now, not by the column default.
alter table public.quotations alter column quotation_number drop default;

create function public.assign_quotation_number()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_prefix text;
  v_next integer;
  v_number text;
begin
  select coalesce(quotation_prefix, 'QUO') into v_prefix from public.finance_settings;
  -- Locks the counter, so two quotations saved at once get different numbers.
  select next_number into v_next from public.quotation_number_counter where id for update;
  v_next := coalesce(v_next, 1);
  loop
    v_number := coalesce(v_prefix, 'QUO') || '-' || lpad(v_next::text, 4, '0');
    exit when not exists (select 1 from public.quotations where quotation_number = v_number);
    v_next := v_next + 1;
  end loop;
  update public.quotation_number_counter set next_number = v_next + 1 where id;
  new.quotation_number := v_number;
  return new;
end;
$$;

-- Runs before the other insert triggers ("quotations_guard" and so on sort after it).
create trigger quotations_assign_number before insert on public.quotations
  for each row execute function public.assign_quotation_number();

-- The next number, for whoever manages finance settings.
create function public.get_next_quotation_number()
returns integer
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.permission_scope_for('finance.manage') is distinct from 'organisation' then
    raise exception 'You do not have permission to see this.' using errcode = 'insufficient_privilege';
  end if;
  return (select next_number from public.quotation_number_counter where id);
end;
$$;

create function public.set_next_quotation_number(p_next integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_old integer;
begin
  if v_actor is null or public.permission_scope_for('finance.manage') is distinct from 'organisation' then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  if p_next is null or p_next not between 1 and 999999 then
    raise exception 'Use a number from 1 to 999999.' using errcode = 'check_violation';
  end if;
  select next_number into v_old from public.quotation_number_counter where id for update;
  if v_old = p_next then
    return;
  end if;
  update public.quotation_number_counter set next_number = p_next where id;

  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  select v_actor, e.full_name, 'updated', 'finance_settings', 'true',
         jsonb_build_object('label', 'Next quotation number', 'from', v_old, 'to', p_next)
  from public.employees e where e.id = v_actor;
end;
$$;

revoke execute on function public.assign_quotation_number() from public, anon, authenticated;
revoke execute on function public.get_next_quotation_number() from public, anon;
revoke execute on function public.set_next_quotation_number(integer) from public, anon;
grant execute on function public.get_next_quotation_number() to authenticated;
grant execute on function public.set_next_quotation_number(integer) to authenticated;
