-- Notification kinds for payroll, recruitment and exits. Enum values must be committed
-- before they are used, so they have a migration of their own.

alter type public.notification_kind add value if not exists 'payroll_review';
alter type public.notification_kind add value if not exists 'payroll_decided';
alter type public.notification_kind add value if not exists 'salary_paid';
alter type public.notification_kind add value if not exists 'candidate_added';
alter type public.notification_kind add value if not exists 'interview_reminder';
alter type public.notification_kind add value if not exists 'resignation_submitted';
alter type public.notification_kind add value if not exists 'resignation_decided';
