-- A notification kind for a task whose deadline moved. Postgres needs it committed in
-- its own migration before later migrations can use it.

alter type public.notification_kind add value if not exists 'task_rescheduled';
