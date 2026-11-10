-- The company's list of services (in groups) and the industries clients belong to.
-- Clients choose one industry, which is optional, and at least one service.
-- Admins keep both lists up to date in Settings, Services and industries.

create table public.service_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index service_groups_name_unique on public.service_groups (lower(name));

create table public.services (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.service_groups (id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index services_name_unique on public.services (lower(name));
create index services_group_idx on public.services (group_id);

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index industries_name_unique on public.industries (lower(name));

insert into public.service_groups (name, sort_order) values
  ('Marketing & Visibility', 10),
  ('Social & Personal Brand', 20),
  ('UGC & Creator Marketing', 30),
  ('Brand & Design', 40),
  ('Web & AI', 50),
  ('Content & Production', 60);

insert into public.services (group_id, name)
select g.id, s.name
from (values
  ('Marketing & Visibility', 'SEO (Search Engine Optimisation)'),
  ('Marketing & Visibility', 'Local SEO'),
  ('Marketing & Visibility', 'Google Business Profile Optimisation'),
  ('Marketing & Visibility', 'Google Ads'),
  ('Marketing & Visibility', 'Meta Ads'),
  ('Marketing & Visibility', 'Performance Marketing'),
  ('Marketing & Visibility', 'AI Search Visibility'),
  ('Marketing & Visibility', 'Digital Marketing'),
  ('Marketing & Visibility', 'Content Marketing'),
  ('Social & Personal Brand', 'Social Media Management'),
  ('Social & Personal Brand', 'Instagram Marketing'),
  ('Social & Personal Brand', 'Personal Branding'),
  ('Social & Personal Brand', 'LinkedIn Branding'),
  ('UGC & Creator Marketing', 'UGC Videos'),
  ('UGC & Creator Marketing', 'Influencer Marketing'),
  ('Brand & Design', 'Brand Identity Design'),
  ('Brand & Design', 'Packaging Design'),
  ('Brand & Design', 'UI/UX Design'),
  ('Brand & Design', 'Pitch Decks'),
  ('Web & AI', 'Website Design'),
  ('Web & AI', 'Website Development'),
  ('Web & AI', 'Web App Development'),
  ('Web & AI', 'Mobile App Development'),
  ('Web & AI', 'AI Chatbots'),
  ('Web & AI', 'WhatsApp Automation'),
  ('Web & AI', 'Marketing Automation'),
  ('Content & Production', 'Photography'),
  ('Content & Production', 'Video Production'),
  ('Content & Production', 'Drone Shoots')
) as s (group_name, name)
join public.service_groups g on g.name = s.group_name;

insert into public.industries (name) values
  ('Real Estate'), ('Interior Design'), ('Construction'), ('Architecture'), ('Healthcare'), ('Clinic'),
  ('Pharma'), ('Wellness'), ('Fitness'), ('School'), ('Coaching Institute'), ('Higher Education'),
  ('Edtech'), ('Study Abroad'), ('Fashion'), ('Jewellery'), ('Beauty'), ('Restaurant'), ('Hospitality'),
  ('Travel'), ('Wedding and Event'), ('Automotive'), ('EV'), ('IT Services'), ('SaaS and Startup'),
  ('E-commerce'), ('Retail'), ('FMCG'), ('Banking and NBFC'), ('Fintech'), ('Insurance'), ('CA Firm'),
  ('Legal'), ('HR and Recruitment'), ('Manufacturing'), ('Industrial Supplies'), ('Logistics'),
  ('Textile and Garment'), ('Agribusiness'), ('Solar'), ('Home Services'), ('Furniture'), ('Electronics'),
  ('ISP'), ('Media and Entertainment'), ('Photography'), ('NGO'), ('Government and PSU'), ('Pet Care'),
  ('Coworking'), ('Security Services'), ('Printing and Packaging'), ('Gaming'), ('Sports Academy'),
  ('Spiritual Services'), ('Aerospace'), ('Biotech'), ('Chemical Industry');

-- ---------------------------------------------------------------------------
-- Links from clients and their services
-- ---------------------------------------------------------------------------

-- The old free-text industry stays, so nothing typed before is lost. It is shown
-- until someone picks an industry from the list.
alter table public.clients add column industry_id uuid references public.industries (id) on delete restrict;
create index clients_industry_idx on public.clients (industry_id);

update public.clients c
set industry_id = i.id
from public.industries i
where c.industry_id is null and c.industry is not null
  and (lower(trim(c.industry)) = lower(i.name) or lower(trim(c.industry)) = lower(i.name) || ' marketing');

alter table public.client_services add column service_id uuid references public.services (id) on delete restrict;
create index client_services_service_idx on public.client_services (service_id, status);

update public.client_services cs
set service_id = s.id
from public.services s
where cs.service_id is null and lower(trim(cs.service_name)) = lower(s.name);

-- A service chosen from the list carries its name, so history stays readable.
create function public.fill_client_service_name()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.service_id is not null then
    select name into new.service_name from public.services where id = new.service_id;
  end if;
  return new;
end;
$$;

create trigger client_services_fill_name before insert or update of service_id on public.client_services
  for each row execute function public.fill_client_service_name();

-- Replaces the client's current (not ended) services with the chosen ones, in one
-- step. Ended services stay as history. The person who added a client may set its
-- first services even when someone else manages it.
create function public.set_client_services(p_client uuid, p_services uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_client public.clients;
begin
  select * into v_client from public.clients where id = p_client;
  if v_actor is null or not found or not (
    public.can_update_client(p_client)
    or (v_client.created_by = v_actor and not exists (select 1 from public.client_services where client_id = p_client))
  ) then
    raise exception 'You do not have permission to change this client''s services.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_services), 0) = 0 then
    raise exception 'Choose at least one service.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(p_services) as chosen (id)
    where not exists (select 1 from public.services s where s.id = chosen.id)
  ) then
    raise exception 'Choose services from the list.' using errcode = 'check_violation';
  end if;

  delete from public.client_services
  where client_id = p_client and status <> 'ended'
    and (service_id is null or not (service_id = any (p_services)));

  insert into public.client_services (client_id, service_id, service_name, status, start_date)
  select p_client, chosen.id, '', 'active', public.india_today()
  from (select distinct unnest(p_services) as id) as chosen
  where not exists (
    select 1 from public.client_services cs
    where cs.client_id = p_client and cs.service_id = chosen.id and cs.status <> 'ended'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permission, triggers and row level security
-- ---------------------------------------------------------------------------

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('catalog.manage', 'Settings', 'Manage services and industries', 'Add, rename and hide the services and industries clients choose from.', '{organisation}', 135);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'catalog.manage', 'organisation'
from public.roles r
where r.name in ('Founder', 'Co-Founder');

create trigger service_groups_set_updated_at before update on public.service_groups
  for each row execute function public.set_updated_at();
create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger industries_set_updated_at before update on public.industries
  for each row execute function public.set_updated_at();
create trigger service_groups_audit after insert or update or delete on public.service_groups
  for each row execute function public.audit_row_change();
create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.audit_row_change();
create trigger industries_audit after insert or update or delete on public.industries
  for each row execute function public.audit_row_change();

alter table public.service_groups enable row level security;
alter table public.services enable row level security;
alter table public.industries enable row level security;

create policy service_groups_select on public.service_groups for select to authenticated
  using (public.current_employee_id() is not null);
create policy service_groups_write on public.service_groups for all to authenticated
  using (public.permission_scope_for('catalog.manage') = 'organisation')
  with check (public.permission_scope_for('catalog.manage') = 'organisation');

create policy services_select on public.services for select to authenticated
  using (public.current_employee_id() is not null);
create policy services_write on public.services for all to authenticated
  using (public.permission_scope_for('catalog.manage') = 'organisation')
  with check (public.permission_scope_for('catalog.manage') = 'organisation');

create policy industries_select on public.industries for select to authenticated
  using (public.current_employee_id() is not null);
create policy industries_write on public.industries for all to authenticated
  using (public.permission_scope_for('catalog.manage') = 'organisation')
  with check (public.permission_scope_for('catalog.manage') = 'organisation');

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, insert, update, delete on public.service_groups, public.services, public.industries to authenticated;
revoke truncate on public.service_groups, public.services, public.industries from authenticated;
grant execute on function public.set_client_services(uuid, uuid[]) to authenticated;
