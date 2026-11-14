-- HR settings are not for Client Managers, as the owner asked. The Client Manager role
-- never had them from a migration, so they were given in Settings, Roles; this takes
-- back every permission behind an HR settings tab: working hours and leave, payroll,
-- recruitment and letters, and exits.

delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id
  and r.name = 'Client Manager'
  and rp.permission_key in ('hr.manage', 'payroll.manage', 'recruitment.manage', 'exits.manage');
