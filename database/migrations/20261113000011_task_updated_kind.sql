-- A notification for "your task was edited". Enum values must be committed before they
-- are used, so it has a migration of its own.

alter type public.notification_kind add value if not exists 'task_updated';
