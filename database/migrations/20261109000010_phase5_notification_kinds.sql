-- New notification kinds for Phase 5. Postgres needs these committed in their own
-- migration before later migrations can use them.

alter type public.notification_kind add value if not exists 'payment_received';
alter type public.notification_kind add value if not exists 'invoice_overdue';
