-- New notification kinds for Phase 4. Postgres needs these committed in their own
-- migration before later migrations can use them.

alter type public.notification_kind add value if not exists 'meeting_invited';
alter type public.notification_kind add value if not exists 'meeting_changed';
alter type public.notification_kind add value if not exists 'meeting_cancelled';
alter type public.notification_kind add value if not exists 'meeting_reminder';
alter type public.notification_kind add value if not exists 'leave_requested';
alter type public.notification_kind add value if not exists 'leave_decided';
alter type public.notification_kind add value if not exists 'ticket_raised';
alter type public.notification_kind add value if not exists 'ticket_updated';
