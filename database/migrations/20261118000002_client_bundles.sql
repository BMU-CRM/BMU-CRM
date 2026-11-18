-- Bundles as client services, as the owner asked: when a client is added or edited, a
-- Client Manager or founder can choose bundles (such as Brand Launch) as well as sub
-- services, each with its plan. A bundle is a monthly project. Its name is kept on the
-- row, as a sub service's is, so history stays readable.

alter table public.client_services
  add column bundle_id uuid references public.service_bundles (id) on delete restrict;
alter table public.client_services
  add constraint client_services_one_kind check (service_id is null or bundle_id is null);
create index client_services_bundle_idx on public.client_services (bundle_id, status);

-- A sub service or a bundle chosen from the list carries its name.
create or replace function public.fill_client_service_name()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.service_id is not null then
    select name into new.service_name from public.services where id = new.service_id;
  elsif new.bundle_id is not null then
    select name into new.service_name from public.service_bundles where id = new.bundle_id;
  end if;
  return new;
end;
$$;

drop trigger client_services_fill_name on public.client_services;
create trigger client_services_fill_name before insert or update of service_id, bundle_id on public.client_services
  for each row execute function public.fill_client_service_name();

-- As before, plus the bundles: p_bundles lists the bundles the client takes, and
-- p_plans maps a sub service's or a bundle's id to its plan. A client needs at least
-- one sub service or bundle.
drop function public.set_client_services(uuid, uuid[], jsonb);
create function public.set_client_services(
  p_client uuid,
  p_services uuid[],
  p_plans jsonb default '{}'::jsonb,
  p_bundles uuid[] default '{}'::uuid[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_client public.clients;
  v_services uuid[] := coalesce(p_services, '{}'::uuid[]);
  v_bundles uuid[] := coalesce(p_bundles, '{}'::uuid[]);
  v_plans jsonb := coalesce(p_plans, '{}'::jsonb);
begin
  select * into v_client from public.clients where id = p_client;
  if v_actor is null or not found or not (
    public.can_update_client(p_client)
    or (v_client.created_by = v_actor and not exists (select 1 from public.client_services where client_id = p_client))
  ) then
    raise exception 'You do not have permission to change this client''s services.' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(v_services) + cardinality(v_bundles) = 0 then
    raise exception 'Choose at least one service or bundle.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(v_services) as chosen (id)
    where not exists (select 1 from public.services s where s.id = chosen.id)
  ) then
    raise exception 'Choose services from the list.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(v_bundles) as chosen (id)
    where not exists (select 1 from public.service_bundles b where b.id = chosen.id)
  ) then
    raise exception 'Choose bundles from the list.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(v_plans) <> 'object' or exists (
    select 1 from jsonb_each_text(v_plans) as p (service, plan)
    where p.plan not in ('starter', 'growth', 'premium')
  ) then
    raise exception 'Choose Starter, Growth or Premium.' using errcode = 'check_violation';
  end if;

  delete from public.client_services
  where client_id = p_client and status <> 'ended'
    and ((service_id is not null and not (service_id = any (v_services)))
      or (bundle_id is not null and not (bundle_id = any (v_bundles))));

  insert into public.client_services (client_id, service_id, service_name, status, start_date)
  select p_client, chosen.id, '', 'active', public.india_today()
  from (select distinct unnest(v_services) as id) as chosen
  where not exists (
    select 1 from public.client_services cs
    where cs.client_id = p_client and cs.service_id = chosen.id and cs.status <> 'ended'
  );

  insert into public.client_services (client_id, bundle_id, service_name, status, start_date)
  select p_client, chosen.id, '', 'active', public.india_today()
  from (select distinct unnest(v_bundles) as id) as chosen
  where not exists (
    select 1 from public.client_services cs
    where cs.client_id = p_client and cs.bundle_id = chosen.id and cs.status <> 'ended'
  );

  update public.client_services cs
  set plan = v_plans ->> coalesce(cs.service_id, cs.bundle_id)::text
  where cs.client_id = p_client and cs.status <> 'ended'
    and coalesce(cs.service_id, cs.bundle_id) is not null
    and v_plans ? coalesce(cs.service_id, cs.bundle_id)::text
    and cs.plan is distinct from v_plans ->> coalesce(cs.service_id, cs.bundle_id)::text;
end;
$$;

revoke execute on function public.set_client_services(uuid, uuid[], jsonb, uuid[]) from public, anon;
grant execute on function public.set_client_services(uuid, uuid[], jsonb, uuid[]) to authenticated;
