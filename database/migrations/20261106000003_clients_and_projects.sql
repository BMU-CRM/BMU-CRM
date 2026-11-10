-- Clients, Client 360 records, projects and milestones.

create type public.client_status as enum ('lead', 'onboarding', 'active', 'on_hold', 'inactive');
create type public.client_record_kind as enum ('note', 'requirement', 'feedback', 'complaint', 'follow_up');
create type public.client_service_status as enum ('active', 'paused', 'ended');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type public.work_priority as enum ('low', 'medium', 'high', 'urgent');

create sequence public.client_code_sequence start 1;
create sequence public.project_code_sequence start 1;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique
    default 'CLI-' || lpad(nextval('public.client_code_sequence')::text, 4, '0'),
  company_name text not null check (length(trim(company_name)) between 2 and 160),
  contact_person text,
  email text,
  phone text,
  address text,
  industry text,
  website text,
  status public.client_status not null default 'lead',
  onboarding_date date,
  next_follow_up_date date,
  important_notes text,
  client_manager_id uuid references public.employees (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_company_name_unique on public.clients (lower(company_name));
create index clients_manager_idx on public.clients (client_manager_id);
create index clients_department_idx on public.clients (department_id);
create index clients_status_idx on public.clients (status);

-- One table for notes, requirements, feedback, complaints and follow-ups, because
-- they share a shape and appear together on the client's page.
create table public.client_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.client_record_kind not null,
  title text not null check (length(trim(title)) between 2 and 200),
  body text,
  rating integer check (rating between 1 and 5),
  due_date date,
  completed_at timestamptz,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_records_client_idx on public.client_records (client_id, kind);

create table public.client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  service_name text not null check (length(trim(service_name)) between 2 and 160),
  status public.client_service_status not null default 'active',
  start_date date,
  end_date date,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_services_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index client_services_client_idx on public.client_services (client_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique
    default 'PRJ-' || lpad(nextval('public.project_code_sequence')::text, 4, '0'),
  name text not null check (length(trim(name)) between 2 and 160),
  description text,
  -- Empty for internal projects.
  client_id uuid references public.clients (id) on delete restrict,
  department_id uuid references public.departments (id) on delete set null,
  project_manager_id uuid references public.employees (id) on delete set null,
  status public.project_status not null default 'planning',
  priority public.work_priority not null default 'medium',
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates check (due_date is null or start_date is null or due_date >= start_date)
);
create index projects_client_idx on public.projects (client_id);
create index projects_department_idx on public.projects (department_id);
create index projects_manager_idx on public.projects (project_manager_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, employee_id)
);
create index project_members_employee_idx on public.project_members (employee_id);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_milestones_project_idx on public.project_milestones (project_id);

-- ---------------------------------------------------------------------------
-- Access functions
-- ---------------------------------------------------------------------------

-- Row level policies pass the row itself. Looking it up by id would fail when a new
-- row is read back after an insert, because the lookup cannot see it yet.
create function public.can_view_client_row(p_client public.clients)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('clients.view');
  v_actor_department uuid;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' or p_client.client_manager_id = v_actor then
    return true;
  end if;

  if exists (
    select 1 from public.projects p
    left join public.project_members m on m.project_id = p.id and m.employee_id = v_actor
    where p.client_id = p_client.id and (p.project_manager_id = v_actor or m.employee_id is not null)
  ) then
    return true;
  end if;

  if v_scope = 'department' then
    select department_id into v_actor_department from public.employees where id = v_actor;
    return v_actor_department is not null and (
      p_client.department_id = v_actor_department
      or exists (
        select 1 from public.projects p
        where p.client_id = p_client.id and p.department_id = v_actor_department
      )
    );
  end if;

  return false;
end;
$$;

create function public.can_view_client(p_client uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_client_row(c) from public.clients c where c.id = p_client), false)
$$;

create function public.can_update_client(p_client uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('clients.update');
  v_manager uuid;
  v_department uuid;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;

  select client_manager_id, department_id into v_manager, v_department
  from public.clients where id = p_client;

  if v_manager = v_actor then
    return true;
  end if;

  return v_scope = 'department' and v_department is not null and v_department = (
    select department_id from public.employees where id = v_actor
  );
end;
$$;

create function public.can_view_project_row(v_project public.projects)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('projects.view');
  v_actor_department uuid;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;

  if v_project.project_manager_id = v_actor
     or v_project.created_by = v_actor
     or exists (
       select 1 from public.project_members m
       where m.project_id = v_project.id and m.employee_id = v_actor
     )
     or exists (
       select 1 from public.tasks t
       where t.project_id = v_project.id and t.assignee_id = v_actor
     ) then
    return true;
  end if;

  if v_scope = 'department' then
    select department_id into v_actor_department from public.employees where id = v_actor;
    if v_actor_department is not null and v_project.department_id = v_actor_department then
      return true;
    end if;
  end if;

  if v_scope in ('team', 'department') then
    return (
      v_project.project_manager_id is not null
      and public.is_in_reporting_line(v_project.project_manager_id, v_actor)
    ) or exists (
      select 1 from public.project_members m
      where m.project_id = v_project.id and public.is_in_reporting_line(m.employee_id, v_actor)
    );
  end if;

  return false;
end;
$$;

create function public.can_view_project(p_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.can_view_project_row(p) from public.projects p where p.id = p_project), false)
$$;

create function public.can_manage_project(p_project uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_scope public.permission_scope := public.permission_scope_for('projects.update');
  v_project public.projects;
begin
  if v_actor is null or v_scope is null then
    return false;
  end if;
  if v_scope = 'organisation' then
    return true;
  end if;

  select * into v_project from public.projects where id = p_project;
  if not found then
    return false;
  end if;

  if v_project.project_manager_id = v_actor or v_project.created_by = v_actor then
    return true;
  end if;

  return v_scope = 'department' and v_project.department_id is not null and v_project.department_id = (
    select department_id from public.employees where id = v_actor
  );
end;
$$;

create function public.can_create_project(p_department uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_scope public.permission_scope := public.permission_scope_for('projects.create');
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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The author of a record comes from the session, never from what the client sends.
create function public.stamp_created_by()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := public.current_employee_id();
    end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create function public.set_project_completed_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger clients_stamp_created_by before insert or update on public.clients
  for each row execute function public.stamp_created_by();
create trigger client_records_stamp_created_by before insert or update on public.client_records
  for each row execute function public.stamp_created_by();
create trigger client_services_stamp_created_by before insert or update on public.client_services
  for each row execute function public.stamp_created_by();
create trigger projects_stamp_created_by before insert or update on public.projects
  for each row execute function public.stamp_created_by();

create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger client_records_set_updated_at before update on public.client_records
  for each row execute function public.set_updated_at();
create trigger client_services_set_updated_at before update on public.client_services
  for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger project_milestones_set_updated_at before update on public.project_milestones
  for each row execute function public.set_updated_at();

create trigger projects_set_completed_at before update of status on public.projects
  for each row execute function public.set_project_completed_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_records enable row level security;
alter table public.client_services enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_milestones enable row level security;

create policy clients_select on public.clients for select to authenticated
  using (public.can_view_client_row(clients));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.has_permission('clients.create'));
create policy clients_update on public.clients for update to authenticated
  using (public.can_update_client(id))
  with check (public.current_employee_id() is not null);

create policy client_records_select on public.client_records for select to authenticated
  using (public.can_view_client(client_id));
create policy client_records_insert on public.client_records for insert to authenticated
  with check (public.can_update_client(client_id));
create policy client_records_update on public.client_records for update to authenticated
  using (public.can_update_client(client_id))
  with check (public.can_update_client(client_id));
create policy client_records_delete on public.client_records for delete to authenticated
  using (public.can_update_client(client_id));

create policy client_services_select on public.client_services for select to authenticated
  using (public.can_view_client(client_id));
create policy client_services_insert on public.client_services for insert to authenticated
  with check (public.can_update_client(client_id));
create policy client_services_update on public.client_services for update to authenticated
  using (public.can_update_client(client_id))
  with check (public.can_update_client(client_id));
create policy client_services_delete on public.client_services for delete to authenticated
  using (public.can_update_client(client_id));

create policy projects_select on public.projects for select to authenticated
  using (public.can_view_project_row(projects));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.can_create_project(department_id));
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id))
  with check (public.current_employee_id() is not null);

create policy project_members_select on public.project_members for select to authenticated
  using (public.can_view_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id));

create policy project_milestones_select on public.project_milestones for select to authenticated
  using (public.can_view_project(project_id));
create policy project_milestones_insert on public.project_milestones for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy project_milestones_update on public.project_milestones for update to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
create policy project_milestones_delete on public.project_milestones for delete to authenticated
  using (public.can_manage_project(project_id));
