-- Narrower access for department heads and employees, as the owner asked:
--
-- * Department heads (Client Manager, Branch Manager, Finance Head, Design & Development
--   Head, Digital Marketing Head) see and edit only their own team in Employees, and
--   can add people to it. People they add always get the default role (Employee).
-- * Employees see only their manager and the colleagues who share that manager.
-- * Only the Founder and Co-Founder see the whole organisation chart.
-- * Only Client Managers, the Founder and the Co-Founder have the Clients section.
--   Finance still sees client names and billing details on quotations and invoices.
--
-- Names stay visible across the app, because people pick colleagues for tasks, chats,
-- meetings and files. What is narrowed is the staff directory and profiles.

-- ---------------------------------------------------------------------------
-- The default role, given to people added by someone who cannot choose roles
-- ---------------------------------------------------------------------------

alter table public.roles add column is_default boolean not null default false;
create unique index roles_one_default on public.roles (is_default) where is_default;
update public.roles set is_default = true where name = 'Employee';

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

update public.permissions
set allowed_scopes = '{team,department,organisation}',
    description = 'Add employees. Team scope adds people who report to you or to someone in your team.'
where key = 'employees.create';

update public.permissions
set description = 'See employee profiles in Employees. Own: your manager and the colleagues who share that manager. Team: the people who report to you.'
where key = 'employees.view';

-- Department heads: their own team only.
update public.role_permissions rp
set scope = 'team'
from public.roles r
where r.id = rp.role_id
  and r.name in ('Client Manager', 'Branch Manager', 'Finance Head', 'Design & Development Head', 'Digital Marketing Head')
  and rp.permission_key in ('employees.view', 'employees.update');

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.permission_key, 'team'
from public.roles r
cross join (values ('employees.create'), ('employees.update')) as p (permission_key)
where r.name in ('Client Manager', 'Branch Manager', 'Finance Head', 'Design & Development Head', 'Digital Marketing Head')
on conflict (role_id, permission_key) do update set scope = 'team';

-- Employees: their manager and colleagues.
update public.role_permissions rp
set scope = 'own'
from public.roles r
where r.id = rp.role_id and r.name = 'Employee' and rp.permission_key = 'employees.view';

-- The organisation chart: Founder and Co-Founder only.
delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id
  and r.name not in ('Founder', 'Co-Founder')
  and rp.permission_key = 'organisation.view';

-- Clients: Client Managers, Founder and Co-Founder only.
delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id
  and r.name in ('Finance Head', 'Design & Development Head', 'Digital Marketing Head')
  and rp.permission_key = 'clients.view';

-- ---------------------------------------------------------------------------
-- The staff directory
-- ---------------------------------------------------------------------------

-- Any active employee can read colleagues' records, so names show on tasks, chats,
-- meetings and files. Who appears in Employees is decided by can_view_employee_profile.
drop policy employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (public.current_employee_id() is not null);

create function public.can_view_employee_profile(p_target uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('employees.view');
  v_manager uuid;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if p_target = v_actor or v_scope = 'organisation' then
    return true;
  end if;
  if v_scope = 'own' then
    select reporting_manager_id into v_manager from public.employees where id = v_actor;
    return v_manager is not null and (
      p_target = v_manager
      or exists (select 1 from public.employees where id = p_target and reporting_manager_id = v_manager)
    );
  end if;
  -- Team: the person's reporting line. Department: also everyone in the department.
  return public.can_access_employee('employees.view', p_target);
end;
$$;

create function public.get_directory_employee_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id from public.employees e where public.can_view_employee_profile(e.id)
$$;

-- ---------------------------------------------------------------------------
-- Adding people
-- ---------------------------------------------------------------------------

drop policy employees_insert on public.employees;
drop function public.can_create_employee(uuid);

-- Department scope adds people to the actor's department. Team scope also requires the
-- new person to report to the actor or to someone in the actor's team.
create function public.can_create_employee(p_department uuid, p_manager uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('employees.create');
  v_department uuid;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;

  select department_id into v_department from public.employees where id = v_actor;
  if p_department is null or v_department is null or p_department <> v_department then
    return false;
  end if;
  if v_scope = 'department' then
    return true;
  end if;
  return p_manager is not null and (p_manager = v_actor or public.is_in_reporting_line(p_manager, v_actor));
end;
$$;

create policy employees_insert on public.employees for insert to authenticated
  with check (public.can_create_employee(department_id, reporting_manager_id));

-- Someone who cannot assign roles adds people with the default role, whatever is sent.
create or replace function public.guard_employee_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_default uuid;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if not public.has_permission('employees.assign_role') then
    select id into v_default from public.roles where is_default;
    if v_default is null then
      raise exception 'No default role is set, so ask an administrator to add this person.'
        using errcode = 'insufficient_privilege';
    end if;
    new.role_id := v_default;
  end if;
  if not public.role_is_assignable(new.role_id) then
    raise exception 'You do not have permission to assign this role.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- As before, plus: with team scope, a new reporting manager must be within the team.
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
-- Clients seen through finance
-- ---------------------------------------------------------------------------

-- People who prepare or read quotations and invoices see the clients they bill: every
-- client at organisation scope, the clients they manage at own scope. This only opens
-- the client row, for names and billing details. Client 360, client files and client
-- chats still need clients.view, through can_view_client.
create function public.client_in_finance_reach(v_client public.clients)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_id() is not null and exists (
    select 1
    from unnest(array['quotations.view', 'quotations.manage', 'invoices.view', 'invoices.manage']) as p (key)
    where public.permission_scope_for(p.key) = 'organisation'
       or (public.permission_scope_for(p.key) = 'own' and v_client.client_manager_id = public.current_employee_id())
  )
$$;

drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.can_view_client_row(clients) or public.client_in_finance_reach(clients));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant execute on function public.can_view_employee_profile(uuid) to authenticated;
grant execute on function public.get_directory_employee_ids() to authenticated;
grant execute on function public.can_create_employee(uuid, uuid) to authenticated;
grant execute on function public.client_in_finance_reach(public.clients) to authenticated;
