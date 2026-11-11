-- Stage 2 of the HR and Finance build: the full employee record.
--
-- * Work details on the employee: employment type, probation and confirmation.
-- * Personal details (date of birth, gender, personal email, address, emergency
--   contact) in their own table. Every employee can read the employees table, so these
--   are kept apart and shown only to the person, HR and whoever manages them.
-- * Identity and bank details in a table only the person and HR can read. Aadhaar and
--   account numbers arrive already encrypted by the app (AES-256-GCM), with only the
--   last four digits in plain text for the masked view. Revealing one is recorded.
-- * Employee documents are files linked to the employee, with a document type. Only
--   the person, whoever uploaded it and HR can see them, whatever other file access
--   someone has.
-- * Employment history read from the audit log.

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('employees.private_view', 'HR', 'View and edit private employee details',
   'See and change identity numbers, bank details and employee documents for everyone.', '{organisation}', 1110);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'employees.private_view', 'organisation'
from public.roles r
where r.name = 'Founder' or lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR lacked seeing their own files, which every employee has. Without it, the rule that
-- people only manage roles whose access they fully hold kept HR from editing employees.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'files.view', 'own'
from public.roles r
where lower(r.name) = 'human resource'
on conflict (role_id, permission_key) do nothing;

create function public.can_manage_private_details()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.permission_scope_for('employees.private_view') is not distinct from 'organisation'
$$;

-- ---------------------------------------------------------------------------
-- Employment types and probation
-- ---------------------------------------------------------------------------

create table public.employment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index employment_types_name_unique on public.employment_types (lower(name));

insert into public.employment_types (name, sort_order) values
  ('Full-time', 10),
  ('Part-time', 20),
  ('Contract', 30),
  ('Intern', 40);

-- Empty until HR sets it, as the owner asked.
alter table public.company_settings
  add column default_probation_months integer check (default_probation_months between 0 and 24);

alter table public.employees
  add column employment_type_id uuid references public.employment_types (id) on delete set null,
  add column probation_months integer check (probation_months between 0 and 24),
  add column probation_end_date date generated always as (
    case when joining_date is not null and probation_months is not null
         then (joining_date + make_interval(months => probation_months))::date end
  ) stored,
  add column confirmation_date date;

-- As before, plus: employment type, probation and confirmation are changed only by
-- someone who manages the employee.
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
  if (select auth.uid()) is null then
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

-- ---------------------------------------------------------------------------
-- Personal details
-- ---------------------------------------------------------------------------

create table public.employee_personal_details (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  date_of_birth date check (date_of_birth > '1900-01-01'),
  gender text check (gender in ('female', 'male', 'other', 'prefer_not_to_say')),
  personal_email text check (personal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(personal_email) <= 254),
  address text check (length(address) <= 1000),
  emergency_contact_name text check (length(emergency_contact_name) <= 120),
  emergency_contact_relation text check (length(emergency_contact_relation) <= 60),
  emergency_contact_phone text check (emergency_contact_phone ~ '^[+\d][\d\s()-]{6,19}$'),
  updated_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The person, HR, and whoever may update the employee's record.
create function public.can_see_personal_details(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and (
    p_employee = public.current_employee_id()
    or public.can_manage_private_details()
    or public.can_access_employee('employees.update', p_employee)
  )
$$;

-- People keep their own contact details up to date. Date of birth and gender are
-- changed by HR or their manager.
create function public.guard_employee_personal_details()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_full boolean;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'Your account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
  end if;

  v_full := public.can_manage_private_details()
    or (new.employee_id <> v_actor and public.can_access_employee('employees.update', new.employee_id));

  if not v_full then
    if new.employee_id <> v_actor then
      raise exception 'You do not have permission to change these details.' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' then
      if new.date_of_birth is not null or new.gender is not null then
        raise exception 'Ask HR to set your date of birth and gender.' using errcode = 'insufficient_privilege';
      end if;
    elsif new.date_of_birth is distinct from old.date_of_birth or new.gender is distinct from old.gender then
      raise exception 'Ask HR to change your date of birth or gender.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  new.updated_by := v_actor;
  return new;
end;
$$;

create trigger employee_personal_details_guard before insert or update on public.employee_personal_details
  for each row execute function public.guard_employee_personal_details();
create trigger employee_personal_details_set_updated_at before update on public.employee_personal_details
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Identity and bank details
-- ---------------------------------------------------------------------------

create table public.employee_private_details (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  -- Encrypted by the app with FIELD_ENCRYPTION_KEY. The database never sees the number.
  aadhaar_encrypted text check (aadhaar_encrypted ~ '^v1:'),
  aadhaar_last4 text check (aadhaar_last4 ~ '^\d{4}$'),
  pan text check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  bank_name text check (length(trim(bank_name)) between 2 and 120),
  account_number_encrypted text check (account_number_encrypted ~ '^v1:'),
  account_last4 text check (account_last4 ~ '^\d{4}$'),
  ifsc text check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  account_holder text check (length(trim(account_holder)) between 2 and 120),
  updated_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_private_details_aadhaar_pair check ((aadhaar_encrypted is null) = (aadhaar_last4 is null)),
  constraint employee_private_details_account_pair check ((account_number_encrypted is null) = (account_last4 is null))
);

create function public.stamp_private_details()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
      raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
    end if;
    new.updated_by := public.current_employee_id();
  end if;
  return new;
end;
$$;

create trigger employee_private_details_stamp before insert or update on public.employee_private_details
  for each row execute function public.stamp_private_details();
create trigger employee_private_details_set_updated_at before update on public.employee_private_details
  for each row execute function public.set_updated_at();

-- Records that someone looked at a full Aadhaar or account number. Called by the app
-- before it decrypts the number, so a refusal here means nothing is shown.
create function public.record_private_detail_reveal(p_employee uuid, p_field text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_name text;
begin
  if v_actor is null or not (p_employee = v_actor or public.can_manage_private_details()) then
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

-- Personal and private details are logged by field name only. Values such as a date of
-- birth or an encrypted number never go into the audit log.
create function public.audit_employee_detail_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_fields jsonb;
  v_employee uuid := new.employee_id;
  v_name text;
begin
  if tg_op = 'UPDATE' then
    select jsonb_agg(n.key order by n.key) into v_fields
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'updated_by', 'created_at', 'employee_id', 'aadhaar_last4', 'account_last4')
      and n.value is distinct from to_jsonb(old) -> n.key;
    if v_fields is null then
      return new;
    end if;
  else
    select jsonb_agg(n.key order by n.key) into v_fields
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'updated_by', 'created_at', 'employee_id', 'aadhaar_last4', 'account_last4')
      and n.value <> 'null'::jsonb;
  end if;

  if v_actor is not null then
    select full_name into v_actor_name from public.employees where id = v_actor;
  end if;
  select full_name into v_name from public.employees where id = v_employee;

  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (v_actor, coalesce(v_actor_name, 'System'), case when tg_op = 'INSERT' then 'created' else 'updated' end,
          tg_table_name, v_employee::text, jsonb_build_object('fields', coalesce(v_fields, '[]'::jsonb), 'label', v_name));
  return new;
end;
$$;

create trigger employee_personal_details_audit after insert or update on public.employee_personal_details
  for each row execute function public.audit_employee_detail_change();
create trigger employee_private_details_audit after insert or update on public.employee_private_details
  for each row execute function public.audit_employee_detail_change();

-- ---------------------------------------------------------------------------
-- Employee documents
-- ---------------------------------------------------------------------------

create type public.employee_document_type as enum (
  'aadhaar', 'pan', 'certificate', 'resume', 'bank', 'offer_letter', 'appointment_letter', 'other'
);

alter table public.files
  add column employee_id uuid references public.employees (id) on delete cascade,
  add column document_type public.employee_document_type,
  add constraint files_employee_document check ((employee_id is null) = (document_type is null)),
  add constraint files_employee_document_alone check (
    employee_id is null or num_nonnulls(client_id, project_id, task_id, meeting_id, ticket_id) = 0
  );
create index files_employee_idx on public.files (employee_id) where employee_id is not null;

-- As before, but an employee document is seen only by the person, whoever uploaded it
-- and HR, whatever other file access someone has. Sharing it does not widen that.
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
  if v_scope = 'organisation' or v_file.owner_id = v_actor then
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

-- As before, plus: people add documents to their own record, and HR to anyone's. A
-- document stays with the employee it was added for.
create or replace function public.check_file_record_links()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.meeting_id is not null and (tg_op = 'INSERT' or new.meeting_id is distinct from old.meeting_id)
      and not public.can_view_meeting(new.meeting_id))
     or (new.ticket_id is not null and (tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id)
      and not public.can_view_ticket(new.ticket_id)) then
    raise exception 'You cannot attach files to that record.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'A document stays with the employee it was added for.' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' and new.employee_id is not null
     and new.employee_id is distinct from public.current_employee_id()
     and not public.can_manage_private_details() then
    raise exception 'You can only add documents to your own record.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger files_check_record_links on public.files;
create trigger files_check_record_links before insert or update of meeting_id, ticket_id, employee_id on public.files
  for each row execute function public.check_file_record_links();

-- As before, but employee documents cannot be sent to anyone.
create or replace function public.stamp_file_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.files where id = new.file_id and employee_id is not null) then
    raise exception 'Employee documents cannot be shared.' using errcode = 'insufficient_privilege';
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;

  new.shared_by := public.current_employee_id();
  select e.full_name, g.title, d.name
    into new.sender_name, new.sender_designation, new.sender_department
  from public.employees e
  left join public.designations g on g.id = e.designation_id
  left join public.departments d on d.id = e.department_id
  where e.id = new.shared_by;

  if new.recipient_employee_id is not null and not exists (
    select 1 from public.employees where id = new.recipient_employee_id and is_active
  ) then
    raise exception 'This person cannot receive files.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employment history, from the audit log
-- ---------------------------------------------------------------------------

-- Turns a stored id into the name people know it by.
create function public.employee_history_value(p_field text, p_value text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_value is null then
    return null;
  end if;
  return case p_field
    when 'designation_id' then (select title from public.designations where id = p_value::uuid)
    when 'department_id' then (select name from public.departments where id = p_value::uuid)
    when 'reporting_manager_id' then (select full_name from public.employees where id = p_value::uuid)
    when 'role_id' then (select name from public.roles where id = p_value::uuid)
    when 'employment_type_id' then (select name from public.employment_types where id = p_value::uuid)
    else p_value
  end;
exception when invalid_text_representation then
  return p_value;
end;
$$;

create function public.get_employment_history(p_employee uuid)
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
  order by 1 desc, 3;
end;
$$;

-- Birthdays in the next 30 days, for HR only, as the owner asked.
create function public.get_upcoming_birthdays()
returns table (employee_id uuid, full_name text, birthday date)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := public.india_today();
begin
  if not public.has_permission('hr.dashboard') then
    raise exception 'You do not have permission to see birthdays.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select e.id, e.full_name, n.next_date
  from public.employees e
  join public.employee_personal_details p on p.employee_id = e.id and p.date_of_birth is not null
  cross join lateral (
    select (p.date_of_birth + make_interval(years => extract(year from age(v_today, p.date_of_birth))::integer))::date as this_year
  ) d
  cross join lateral (
    select case when d.this_year >= v_today then d.this_year
                else (p.date_of_birth + make_interval(years => extract(year from age(v_today, p.date_of_birth))::integer + 1))::date
           end as next_date
  ) n
  where e.is_active and n.next_date <= v_today + 30
  order by n.next_date, e.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers and row level security
-- ---------------------------------------------------------------------------

create trigger employment_types_set_updated_at before update on public.employment_types
  for each row execute function public.set_updated_at();
create trigger employment_types_audit after insert or update or delete on public.employment_types
  for each row execute function public.audit_row_change();

alter table public.employment_types enable row level security;
alter table public.employee_personal_details enable row level security;
alter table public.employee_private_details enable row level security;

create policy employment_types_select on public.employment_types for select to authenticated
  using (public.current_employee_id() is not null);
create policy employment_types_write on public.employment_types for all to authenticated
  using (public.has_permission('hr.manage')) with check (public.has_permission('hr.manage'));

create policy employee_personal_details_select on public.employee_personal_details for select to authenticated
  using (public.can_see_personal_details(employee_id));
create policy employee_personal_details_insert on public.employee_personal_details for insert to authenticated
  with check (public.can_see_personal_details(employee_id));
create policy employee_personal_details_update on public.employee_personal_details for update to authenticated
  using (public.can_see_personal_details(employee_id))
  with check (public.can_see_personal_details(employee_id));

create policy employee_private_details_select on public.employee_private_details for select to authenticated
  using (employee_id = public.current_employee_id() or public.can_manage_private_details());
create policy employee_private_details_insert on public.employee_private_details for insert to authenticated
  with check (public.can_manage_private_details());
create policy employee_private_details_update on public.employee_private_details for update to authenticated
  using (public.can_manage_private_details())
  with check (public.can_manage_private_details());

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions start open to anon, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.employment_types to authenticated;
grant select, insert, update on public.employee_personal_details to authenticated;
grant select, insert, update on public.employee_private_details to authenticated;

grant execute on function public.can_manage_private_details() to authenticated;
grant execute on function public.can_see_personal_details(uuid) to authenticated;
grant execute on function public.record_private_detail_reveal(uuid, text) to authenticated;
grant execute on function public.get_employment_history(uuid) to authenticated;
grant execute on function public.get_upcoming_birthdays() to authenticated;
-- Re-granted, because the function was replaced.
grant execute on function public.can_view_file_row(public.files) to authenticated;
