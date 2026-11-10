-- Phase 4 permissions and grants.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('leave.request', 'Leave and attendance', 'Request leave', 'Apply for leave and see your own balance.', '{own}', 700),
  ('leave.approve', 'Leave and attendance', 'Approve leave', 'Approve or reject leave for people in your reach.', '{team,department,organisation}', 710),
  ('attendance.view', 'Leave and attendance', 'View attendance', 'See attendance records and reports.', '{own,team,department,organisation}', 720),
  ('attendance.manage', 'Leave and attendance', 'Correct and import attendance', 'Correct attendance records and import them from other systems.', '{department,organisation}', 730),
  ('hr.manage', 'Leave and attendance', 'Manage HR settings', 'Set leave types, holidays and working hours.', '{organisation}', 740),
  ('meetings.create', 'Meetings', 'Schedule meetings', 'Schedule meetings and invite people.', '{own}', 800),
  ('meetings.view', 'Meetings', 'View meetings', 'See meetings beyond those you are invited to.', '{own,organisation}', 810),
  ('tickets.create', 'Support', 'Raise support tickets', 'Ask the support team for help.', '{own}', 900),
  ('tickets.manage', 'Support', 'Handle support tickets', 'Work on tickets for your department, or for everyone.', '{department,organisation}', 910);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.sort_order >= 700;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, m.scope::public.permission_scope
from (
  select role_name, permission_key, scope
  from (values
    ('Co-Founder', 'leave.approve', 'organisation'),
    ('Co-Founder', 'attendance.view', 'organisation'),
    ('Co-Founder', 'attendance.manage', 'organisation'),
    ('Co-Founder', 'hr.manage', 'organisation'),
    ('Co-Founder', 'meetings.view', 'organisation'),
    ('Co-Founder', 'tickets.manage', 'organisation'),
    ('Client Manager', 'leave.approve', 'team'),
    ('Client Manager', 'attendance.view', 'team'),
    ('Branch Manager', 'leave.approve', 'department'),
    ('Branch Manager', 'attendance.view', 'department'),
    ('Branch Manager', 'attendance.manage', 'department'),
    ('Branch Manager', 'tickets.manage', 'department'),
    ('Finance Head', 'leave.approve', 'department'),
    ('Finance Head', 'attendance.view', 'department'),
    ('Finance Head', 'tickets.manage', 'department'),
    ('Design & Development Head', 'leave.approve', 'department'),
    ('Design & Development Head', 'attendance.view', 'department'),
    ('Design & Development Head', 'tickets.manage', 'department'),
    ('Digital Marketing Head', 'leave.approve', 'department'),
    ('Digital Marketing Head', 'attendance.view', 'department'),
    ('Digital Marketing Head', 'tickets.manage', 'department'),
    ('Employee', 'attendance.view', 'own')
  ) as specific (role_name, permission_key, scope)
  union all
  select r.name, shared.permission_key, 'own'
  from public.roles r
  cross join (values ('leave.request'), ('meetings.create'), ('tickets.create')) as shared (permission_key)
  where r.name <> 'Founder'
) m
join public.roles r on r.name = m.role_name;

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions are open to anon by default, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, update on public.company_settings to authenticated;
grant select, insert, update, delete on public.holidays to authenticated;
grant select, insert, update, delete on public.leave_types to authenticated;
grant select, insert, update on public.leave_requests to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.meeting_participants to authenticated;
grant select, insert, update, delete on public.ticket_categories to authenticated;
grant select, insert, update on public.tickets to authenticated;
grant select, insert, update on public.ticket_comments to authenticated;
grant usage on sequence public.ticket_code_sequence to authenticated;

grant execute on function public.india_today() to authenticated;
grant execute on function public.count_working_days(date, date) to authenticated;
grant execute on function public.can_decide_leave_row(public.leave_requests) to authenticated;
grant execute on function public.can_view_leave_row(public.leave_requests) to authenticated;
grant execute on function public.get_leave_balances(uuid, integer) to authenticated;
grant execute on function public.get_team_leave(date, date) to authenticated;
grant execute on function public.attendance_check_in() to authenticated;
grant execute on function public.attendance_check_out() to authenticated;
grant execute on function public.import_attendance(jsonb) to authenticated, service_role;
grant execute on function public.get_attendance_report_data(date, date) to authenticated;
grant execute on function public.can_view_meeting_row(public.meetings) to authenticated;
grant execute on function public.can_view_meeting(uuid) to authenticated;
grant execute on function public.is_meeting_organizer(uuid) to authenticated;
grant execute on function public.can_manage_ticket_row(public.tickets) to authenticated;
grant execute on function public.can_view_ticket_row(public.tickets) to authenticated;
grant execute on function public.can_view_ticket(uuid) to authenticated;
-- Re-granted, because the function was replaced to add meetings and tickets.
grant execute on function public.can_view_file_row(public.files) to authenticated;

-- Not callable through the API.
revoke execute on function public.leave_days_taken(uuid, uuid, integer, uuid) from authenticated;
revoke execute on function public.send_meeting_reminders() from authenticated;

alter publication live_updates add table public.tickets;
