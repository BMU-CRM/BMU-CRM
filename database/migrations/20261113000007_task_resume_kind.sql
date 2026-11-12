-- A notification for "your manager asked you to resume this task". Enum values must be
-- committed before they are used, so it has a migration of its own.

alter type public.notification_kind add value if not exists 'task_resume_requested';
