-- Two changes the owner asked for:
--
-- * Only HR and the administrators (Founder, Co-Founder) add employees. Department heads,
--   Client Managers and the Finance Head keep seeing and editing their own team, but no
--   longer add people to it.
-- * PAN is masked like the Aadhaar and account numbers, so showing it in full is a
--   recorded reveal too. (The app also asks for the viewer's password first.)

delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id
  and r.name in ('Client Manager', 'Branch Manager', 'Finance Head', 'Design & Development Head', 'Digital Marketing Head')
  and rp.permission_key = 'employees.create';

create or replace function public.record_private_detail_reveal(p_employee uuid, p_field text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := public.current_employee_id();
  v_actor_name text;
  v_name text;
begin
  if v_actor is null or not (
    p_employee = v_actor or (public.can_manage_private_details() and public.can_see_employee_record(p_employee))
  ) then
    raise exception 'You do not have permission to see this.' using errcode = 'insufficient_privilege';
  end if;
  if p_field not in ('aadhaar', 'account_number', 'pan') then
    raise exception 'Unknown detail.' using errcode = 'check_violation';
  end if;

  select full_name into v_actor_name from public.employees where id = v_actor;
  select full_name into v_name from public.employees where id = p_employee;

  insert into public.audit_logs (actor_employee_id, actor_name, action, entity_type, entity_id, details)
  values (v_actor, coalesce(v_actor_name, 'System'), 'revealed', 'employee_private_details', p_employee::text,
          jsonb_build_object('field', p_field, 'label', v_name));
end;
$$;
