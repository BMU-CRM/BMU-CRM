-- Services typed in before the service list existed have no link to the list. Saving
-- a client's chosen services must not remove them, so only listed services are
-- replaced. People remove old typed services themselves on Client 360.

create or replace function public.set_client_services(p_client uuid, p_services uuid[])
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
    and service_id is not null and not (service_id = any (p_services));

  insert into public.client_services (client_id, service_id, service_name, status, start_date)
  select p_client, chosen.id, '', 'active', public.india_today()
  from (select distinct unnest(p_services) as id) as chosen
  where not exists (
    select 1 from public.client_services cs
    where cs.client_id = p_client and cs.service_id = chosen.id and cs.status <> 'ended'
  );
end;
$$;

-- Re-granted, because the function was replaced.
grant execute on function public.set_client_services(uuid, uuid[]) to authenticated;
revoke execute on function public.set_client_services(uuid, uuid[]) from public, anon;
