-- Notification kinds for department budgets (Stage 11) and the HR notifications review
-- (Stage 12). Enum values must be committed before they are used, so they have a
-- migration of their own.

alter type public.notification_kind add value if not exists 'budget_alert';
alter type public.notification_kind add value if not exists 'employee_added';
alter type public.notification_kind add value if not exists 'attendance_irregularity';
