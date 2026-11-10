-- Starting organisation structure. Everything here can be changed in the app,
-- except the protected Founder role. Later modules add their own permissions.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('dashboard.view', 'Overview', 'View personal dashboard', 'Open the overview page.', '{own}', 10),
  ('employees.view', 'Employees', 'View employees', 'See employee profiles and the directory.', '{own,team,department,organisation}', 20),
  ('employees.create', 'Employees', 'Add employees', 'Invite new employees.', '{department,organisation}', 30),
  ('employees.update', 'Employees', 'Edit employees', 'Change employee details, managers and designations.', '{team,department,organisation}', 40),
  ('employees.assign_role', 'Employees', 'Assign roles', 'Change which role an employee has.', '{team,department,organisation}', 50),
  ('employees.deactivate', 'Employees', 'Activate and deactivate accounts', 'Control whether an employee can sign in.', '{team,department,organisation}', 60),
  ('team.view', 'Employees', 'View team', 'See the people who report to you.', '{team}', 70),
  ('organisation.view', 'Organisation', 'View hierarchy', 'See the organisation chart.', '{organisation}', 80),
  ('organisation.stats', 'Organisation', 'View organisation statistics', 'See headcount figures on the dashboard.', '{department,organisation}', 90),
  ('departments.manage', 'Organisation', 'Manage departments', 'Add, edit and remove departments.', '{organisation}', 100),
  ('designations.manage', 'Organisation', 'Manage designations', 'Add, edit and remove designations and management levels.', '{organisation}', 110),
  ('roles.manage', 'Settings', 'Manage roles and permissions', 'Create roles and decide what each one can do.', '{organisation}', 120),
  ('audit.view', 'Settings', 'View audit log', 'See the record of who changed what.', '{own,organisation}', 130);

insert into public.roles (name, description, is_protected) values
  ('Founder', 'Full access to the whole organisation.', true),
  ('Co-Founder', 'Organisation oversight, as allowed by the Founder.', false),
  ('Client Manager', 'Manages client relationships from onboarding to billing.', false),
  ('Branch Manager', 'Manages branch people and operations.', false),
  ('Finance Head', 'Leads finance.', false),
  ('Design & Development Head', 'Leads the Design & Development team.', false),
  ('Digital Marketing Head', 'Leads the Digital Marketing team.', false),
  ('Employee', 'Personal workspace access.', false);

insert into public.departments (name, description) values
  ('Management', 'Founders and senior leadership.'),
  ('Client Services', 'Client relationships and onboarding.'),
  ('Branch Operations', 'Branch people and day-to-day operations.'),
  ('Finance', 'Quotations, invoices, payments and reporting.'),
  ('Design & Development', 'Design, development and testing.'),
  ('Digital Marketing', 'SEO, social media, paid advertising and content.');

insert into public.designations (title, management_level) values
  ('Founder', 1),
  ('Co-Founder', 1),
  ('Client Manager', 2),
  ('Branch Manager', 2),
  ('Finance Head', 2),
  ('Design & Development Head', 2),
  ('Digital Marketing Head', 2),
  ('Team Member', 5);

-- Founder: every permission at its widest scope.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder';

-- Everyone else, from the matrix in docs/PermissionMatrix.md.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, m.scope::public.permission_scope
from (values
  ('Co-Founder', 'dashboard.view', 'own'),
  ('Co-Founder', 'employees.view', 'organisation'),
  ('Co-Founder', 'employees.create', 'organisation'),
  ('Co-Founder', 'employees.update', 'organisation'),
  ('Co-Founder', 'employees.assign_role', 'organisation'),
  ('Co-Founder', 'employees.deactivate', 'organisation'),
  ('Co-Founder', 'team.view', 'team'),
  ('Co-Founder', 'organisation.view', 'organisation'),
  ('Co-Founder', 'organisation.stats', 'organisation'),
  ('Co-Founder', 'departments.manage', 'organisation'),
  ('Co-Founder', 'designations.manage', 'organisation'),
  ('Co-Founder', 'audit.view', 'organisation'),

  ('Client Manager', 'dashboard.view', 'own'),
  ('Client Manager', 'employees.view', 'organisation'),
  ('Client Manager', 'team.view', 'team'),
  ('Client Manager', 'organisation.view', 'organisation'),

  ('Branch Manager', 'dashboard.view', 'own'),
  ('Branch Manager', 'employees.view', 'organisation'),
  ('Branch Manager', 'employees.update', 'department'),
  ('Branch Manager', 'team.view', 'team'),
  ('Branch Manager', 'organisation.view', 'organisation'),
  ('Branch Manager', 'organisation.stats', 'department'),

  ('Finance Head', 'dashboard.view', 'own'),
  ('Finance Head', 'employees.view', 'organisation'),
  ('Finance Head', 'employees.update', 'department'),
  ('Finance Head', 'team.view', 'team'),
  ('Finance Head', 'organisation.view', 'organisation'),
  ('Finance Head', 'organisation.stats', 'department'),

  ('Design & Development Head', 'dashboard.view', 'own'),
  ('Design & Development Head', 'employees.view', 'organisation'),
  ('Design & Development Head', 'employees.update', 'department'),
  ('Design & Development Head', 'team.view', 'team'),
  ('Design & Development Head', 'organisation.view', 'organisation'),
  ('Design & Development Head', 'organisation.stats', 'department'),

  ('Digital Marketing Head', 'dashboard.view', 'own'),
  ('Digital Marketing Head', 'employees.view', 'organisation'),
  ('Digital Marketing Head', 'employees.update', 'department'),
  ('Digital Marketing Head', 'team.view', 'team'),
  ('Digital Marketing Head', 'organisation.view', 'organisation'),
  ('Digital Marketing Head', 'organisation.stats', 'department'),

  ('Employee', 'dashboard.view', 'own'),
  ('Employee', 'employees.view', 'organisation'),
  ('Employee', 'organisation.view', 'organisation')
) as m (role_name, permission_key, scope)
join public.roles r on r.name = m.role_name;
