-- The plan a client takes for each sub service: Starter, Growth or Premium. Chosen when
-- the client is added or edited, and used for the rate when their services are added
-- to a quotation or invoice.

alter table public.client_services
  add column plan text check (plan in ('starter', 'growth', 'premium'));

-- As before, plus the plans: p_plans maps a sub service's id to its plan, such as
-- {"<id>": "growth"}. A sub service left out keeps the plan it has.
drop function public.set_client_services(uuid, uuid[]);
create function public.set_client_services(p_client uuid, p_services uuid[], p_plans jsonb default '{}'::jsonb)
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
  if jsonb_typeof(coalesce(p_plans, '{}'::jsonb)) <> 'object' or exists (
    select 1 from jsonb_each_text(coalesce(p_plans, '{}'::jsonb)) as p (service, plan)
    where p.plan not in ('starter', 'growth', 'premium')
  ) then
    raise exception 'Choose Starter, Growth or Premium.' using errcode = 'check_violation';
  end if;

  delete from public.client_services
  where client_id = p_client and status <> 'ended'
    and service_id is not null and not (service_id = any (p_services));

  insert into public.client_services (client_id, service_id, service_name, status, start_date)
  select p_client, chosen.id, '', 'active', public.india_today()
  from (select distinct unnest(p_services) as id) as chosen
  where not exists (
    select 1 from public.client_services cs
    where cs.client_id = p_client and cs.service_id = chosen.id and cs.status <> 'ended'
  );

  update public.client_services cs
  set plan = p_plans ->> cs.service_id::text
  where cs.client_id = p_client and cs.status <> 'ended'
    and cs.service_id is not null and coalesce(p_plans, '{}'::jsonb) ? cs.service_id::text
    and cs.plan is distinct from p_plans ->> cs.service_id::text;
end;
$$;

revoke execute on function public.set_client_services(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.set_client_services(uuid, uuid[], jsonb) to authenticated;
