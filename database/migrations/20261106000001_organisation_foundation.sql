-- Organisation foundation: departments, designations, roles, permissions,
-- employees and the immutable audit log. Every later module builds on these.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- Declared from narrowest to widest, so scopes can be compared with < and >.
create type public.permission_scope as enum ('own', 'team', 'department', 'organisation');

create type public.employment_status as enum ('active', 'on_leave', 'notice_period', 'exited');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  description text,
  parent_department_id uuid references public.departments (id) on delete set null,
  head_employee_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index departments_name_unique on public.departments (lower(name));

-- management_level sets seniority. 1 is the most senior. New levels need no code.
create table public.designations (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 100),
  management_level integer not null default 5 check (management_level between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index designations_title_unique on public.designations (lower(title));

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  description text,
  -- A protected role cannot be edited or deleted from the app.
  is_protected boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index roles_name_unique on public.roles (lower(name));

create table public.permissions (
  key text primary key,
  module text not null,
  label text not null,
  description text not null,
  allowed_scopes public.permission_scope[] not null default '{organisation}',
  sort_order integer not null default 0
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  scope public.permission_scope not null default 'organisation',
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create sequence public.employee_code_sequence start 1;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  employee_code text not null unique
    default 'EMP-' || lpad(nextval('public.employee_code_sequence')::text, 4, '0'),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  work_email text not null check (work_email = lower(work_email) and work_email like '%@%'),
  phone text,
  avatar_url text,
  skills text[] not null default '{}',
  role_id uuid not null references public.roles (id) on delete restrict,
  designation_id uuid references public.designations (id) on delete restrict,
  department_id uuid references public.departments (id) on delete restrict,
  reporting_manager_id uuid references public.employees (id) on delete set null,
  joining_date date,
  employment_status public.employment_status not null default 'active',
  -- Controls sign-in and data access. Records are deactivated, never deleted,
  -- so that task, file and audit history stays intact.
  is_active boolean not null default true,
  invite_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_not_own_manager check (reporting_manager_id is distinct from id)
);
create unique index employees_work_email_unique on public.employees (work_email);
create index employees_role_idx on public.employees (role_id);
create index employees_department_idx on public.employees (department_id);
create index employees_manager_idx on public.employees (reporting_manager_id);

alter table public.departments
  add constraint departments_head_employee_fk
  foreign key (head_employee_id) references public.employees (id) on delete set null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- Actor details are copied, not linked, so a log entry can never change.
  actor_employee_id uuid,
  actor_name text not null default 'System',
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_employee_id);

-- ---------------------------------------------------------------------------
-- Access functions
-- ---------------------------------------------------------------------------

-- Returns null for an inactive employee, which removes all of their data access.
create function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.auth_user_id = (select auth.uid()) and e.is_active
$$;

create function public.permission_scope_for(p_permission text)
returns public.permission_scope
language sql stable security definer set search_path = ''
as $$
  select rp.scope
  from public.employees e
  join public.roles r on r.id = e.role_id and r.is_active
  join public.role_permissions rp on rp.role_id = r.id
  where e.id = public.current_employee_id() and rp.permission_key = p_permission
$$;

create function public.has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.permission_scope_for(p_permission) is not null
$$;

-- True when p_employee sits anywhere below p_manager in the reporting line.
create function public.is_in_reporting_line(p_employee uuid, p_manager uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive chain as (
    select e.reporting_manager_id, 1 as depth
    from public.employees e
    where e.id = p_employee
    union all
    select e.reporting_manager_id, c.depth + 1
    from public.employees e
    join chain c on e.id = c.reporting_manager_id
    where c.depth < 50
  )
  select exists (select 1 from chain where reporting_manager_id = p_manager)
$$;

-- Applies a scoped permission to one employee. A wider scope includes the
-- narrower ones, and every scope includes the actor themselves.
create function public.can_access_employee(p_permission text, p_target uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for(p_permission);
  v_actor_department uuid;
  v_target_department uuid;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' or p_target = v_actor then
    return true;
  end if;
  if v_scope = 'own' then
    return false;
  end if;
  if v_scope = 'department' then
    select department_id into v_actor_department from public.employees where id = v_actor;
    select department_id into v_target_department from public.employees where id = p_target;
    if v_actor_department is not null and v_actor_department = v_target_department then
      return true;
    end if;
  end if;
  return public.is_in_reporting_line(p_target, v_actor);
end;
$$;

-- A role is assignable only when the actor already holds everything it grants,
-- at the same scope or wider. This stops anyone granting more than they have.
create function public.role_is_assignable(p_role uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = p_role
      and (
        public.permission_scope_for(rp.permission_key) is null
        or public.permission_scope_for(rp.permission_key) < rp.scope
      )
  )
$$;

create function public.can_create_employee(p_department uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_scope public.permission_scope := public.permission_scope_for('employees.create');
begin
  if v_scope = 'organisation' then
    return true;
  end if;
  if v_scope = 'department' then
    return p_department is not null and p_department = (
      select department_id from public.employees where id = public.current_employee_id()
    );
  end if;
  return false;
end;
$$;

create function public.role_is_protected(p_role uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_protected from public.roles where id = p_role), false)
$$;

create function public.get_my_permissions()
returns table (permission_key text, scope public.permission_scope)
language sql stable security definer set search_path = ''
as $$
  select rp.permission_key, rp.scope
  from public.employees e
  join public.roles r on r.id = e.role_id and r.is_active
  join public.role_permissions rp on rp.role_id = r.id
  where e.id = public.current_employee_id()
$$;

create function public.get_my_team_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  with recursive team as (
    select e.id, 1 as depth
    from public.employees e
    where e.reporting_manager_id = public.current_employee_id()
    union all
    select e.id, t.depth + 1
    from public.employees e
    join team t on e.reporting_manager_id = t.id
    where t.depth < 50
  )
  select id from team
$$;

create function public.get_assignable_role_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select r.id
  from public.roles r
  where r.is_active and public.role_is_assignable(r.id)
$$;

-- Replaces a role's permissions in one transaction. This runs as the caller, so
-- the row level security rules below still decide what is allowed.
create function public.set_role_permissions(p_role uuid, p_permissions jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.role_permissions rp
  where rp.role_id = p_role
    and not exists (
      select 1
      from jsonb_array_elements(p_permissions) item
      where item ->> 'key' = rp.permission_key
    );

  insert into public.role_permissions (role_id, permission_key, scope)
  select p_role, item ->> 'key', (item ->> 'scope')::public.permission_scope
  from jsonb_array_elements(p_permissions) item
  on conflict (role_id, permission_key) do update
    set scope = excluded.scope
    where public.role_permissions.scope is distinct from excluded.scope;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger departments_set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();
create trigger designations_set_updated_at before update on public.designations
  for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- A manager cannot report to someone below them, at any depth.
create function public.prevent_reporting_cycle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.reporting_manager_id is not null
     and public.is_in_reporting_line(new.reporting_manager_id, new.id) then
    raise exception 'This reporting manager would create a reporting loop.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger employees_prevent_reporting_cycle
  before insert or update of reporting_manager_id on public.employees
  for each row execute function public.prevent_reporting_cycle();

create function public.prevent_department_cycle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_found boolean;
begin
  if new.parent_department_id is null then
    return new;
  end if;
  with recursive chain as (
    select d.id, d.parent_department_id, 1 as depth
    from public.departments d
    where d.id = new.parent_department_id
    union all
    select d.id, d.parent_department_id, c.depth + 1
    from public.departments d
    join chain c on d.id = c.parent_department_id
    where c.depth < 50
  )
  select exists (select 1 from chain where id = new.id) into v_found;
  if v_found then
    raise exception 'This parent department would create a loop.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger departments_prevent_cycle
  before insert or update of parent_department_id on public.departments
  for each row execute function public.prevent_department_cycle();

-- Checks each field on an employee update. Requests with no signed-in user come
-- from trusted server code using the service role key.
create function public.guard_employee_update()
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

create trigger employees_guard_update
  before update on public.employees
  for each row execute function public.guard_employee_update();

create function public.guard_employee_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if not public.has_permission('employees.assign_role')
     or not public.role_is_assignable(new.role_id) then
    raise exception 'You do not have permission to assign this role.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger employees_guard_insert
  before insert on public.employees
  for each row execute function public.guard_employee_insert();

create function public.guard_role_permission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_allowed public.permission_scope[];
begin
  select allowed_scopes into v_allowed from public.permissions where key = new.permission_key;
  if not new.scope = any (v_allowed) then
    raise exception 'The % scope is not available for %.', new.scope, new.permission_key
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger role_permissions_guard
  before insert or update on public.role_permissions
  for each row execute function public.guard_role_permission();

-- The company must always keep someone who can manage roles.
create function public.ensure_role_administrator_exists()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  if not exists (
    select 1
    from public.employees e
    join public.roles r on r.id = e.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id
    where e.is_active and rp.permission_key = 'roles.manage'
  ) then
    raise exception 'At least one active employee must be able to manage roles.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger employees_keep_role_administrator
  after update on public.employees
  for each row execute function public.ensure_role_administrator_exists();

create constraint trigger role_permissions_keep_role_administrator
  after update or delete on public.role_permissions
  for each row execute function public.ensure_role_administrator_exists();

create constraint trigger roles_keep_role_administrator
  after update on public.roles
  for each row execute function public.ensure_role_administrator_exists();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

-- Recording changes in the database means no code path can skip the audit log.
create function public.audit_row_change()
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
  v_label := coalesce(v_row ->> 'full_name', v_row ->> 'name', v_row ->> 'title');
  if tg_table_name = 'role_permissions' then
    select r.name || ': ' || (v_row ->> 'permission_key') into v_label
    from public.roles r
    where r.id = (v_row ->> 'role_id')::uuid;
  end if;
  v_details := v_details || jsonb_build_object('label', v_label);

  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (
    v_actor,
    coalesce(v_actor_name, 'System'),
    v_action,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'role_id'),
    v_details
  );

  return coalesce(new, old);
end;
$$;

create trigger employees_audit after insert or update or delete on public.employees
  for each row execute function public.audit_row_change();
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function public.audit_row_change();
create trigger designations_audit after insert or update or delete on public.designations
  for each row execute function public.audit_row_change();
create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.audit_row_change();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.audit_row_change();

create function public.reject_audit_log_change()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Audit logs cannot be changed or deleted.' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.reject_audit_log_change();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.reject_audit_log_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.designations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employees enable row level security;
alter table public.audit_logs enable row level security;

create policy departments_select on public.departments for select to authenticated
  using (public.current_employee_id() is not null);
create policy departments_insert on public.departments for insert to authenticated
  with check (public.has_permission('departments.manage'));
create policy departments_update on public.departments for update to authenticated
  using (public.has_permission('departments.manage'))
  with check (public.has_permission('departments.manage'));
create policy departments_delete on public.departments for delete to authenticated
  using (public.has_permission('departments.manage'));

create policy designations_select on public.designations for select to authenticated
  using (public.current_employee_id() is not null);
create policy designations_insert on public.designations for insert to authenticated
  with check (public.has_permission('designations.manage'));
create policy designations_update on public.designations for update to authenticated
  using (public.has_permission('designations.manage'))
  with check (public.has_permission('designations.manage'));
create policy designations_delete on public.designations for delete to authenticated
  using (public.has_permission('designations.manage'));

create policy roles_select on public.roles for select to authenticated
  using (public.current_employee_id() is not null);
create policy roles_insert on public.roles for insert to authenticated
  with check (public.has_permission('roles.manage') and not is_protected);
create policy roles_update on public.roles for update to authenticated
  using (public.has_permission('roles.manage') and not is_protected)
  with check (public.has_permission('roles.manage') and not is_protected);
create policy roles_delete on public.roles for delete to authenticated
  using (public.has_permission('roles.manage') and not is_protected);

create policy permissions_select on public.permissions for select to authenticated
  using (public.current_employee_id() is not null);

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (
    public.has_permission('roles.manage')
    or role_id = (select role_id from public.employees where id = public.current_employee_id())
  );
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (
    public.has_permission('roles.manage')
    and not public.role_is_protected(role_id)
    and public.permission_scope_for(permission_key) >= scope
  );
create policy role_permissions_update on public.role_permissions for update to authenticated
  using (public.has_permission('roles.manage') and not public.role_is_protected(role_id))
  with check (
    public.has_permission('roles.manage')
    and not public.role_is_protected(role_id)
    and public.permission_scope_for(permission_key) >= scope
  );
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (public.has_permission('roles.manage') and not public.role_is_protected(role_id));

create policy employees_select on public.employees for select to authenticated
  using (public.can_access_employee('employees.view', id));
create policy employees_insert on public.employees for insert to authenticated
  with check (public.can_create_employee(department_id));
-- Field-level rules are applied by guard_employee_update.
create policy employees_update on public.employees for update to authenticated
  using (
    id = public.current_employee_id()
    or public.can_access_employee('employees.update', id)
    or public.can_access_employee('employees.assign_role', id)
    or public.can_access_employee('employees.deactivate', id)
  )
  with check (public.current_employee_id() is not null);

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    public.permission_scope_for('audit.view') = 'organisation'
    or (
      public.has_permission('audit.view')
      and actor_employee_id = public.current_employee_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Grants. The anon role gets nothing: this app is private.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.designations to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update on public.employees to authenticated;
revoke delete on public.employees from authenticated;
grant select on public.audit_logs to authenticated;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
grant usage on sequence public.employee_code_sequence to authenticated;

grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.permission_scope_for(text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_in_reporting_line(uuid, uuid) to authenticated;
grant execute on function public.can_access_employee(text, uuid) to authenticated;
grant execute on function public.role_is_assignable(uuid) to authenticated;
grant execute on function public.can_create_employee(uuid) to authenticated;
grant execute on function public.role_is_protected(uuid) to authenticated;
grant execute on function public.get_my_permissions() to authenticated;
grant execute on function public.get_my_team_ids() to authenticated;
grant execute on function public.get_assignable_role_ids() to authenticated;
grant execute on function public.set_role_permissions(uuid, jsonb) to authenticated;
