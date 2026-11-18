-- A notification for the Founder when a Client Manager or HR sends a workload report.
-- Enum values must be committed before they are used, so this has a migration of its own.

alter type public.notification_kind add value if not exists 'workload_report_received';
