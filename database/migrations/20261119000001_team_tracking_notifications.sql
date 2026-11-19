-- Notifications for team tracking: a sent workload report was reviewed, and the daily
-- reminder to send one. Enum values must be committed before they are used, so they
-- have a migration of their own.

alter type public.notification_kind add value if not exists 'workload_report_reviewed';
alter type public.notification_kind add value if not exists 'workload_report_reminder';
