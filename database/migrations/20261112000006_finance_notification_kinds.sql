-- Notification kinds for follow-ups, purchases and reimbursements. Enum values must be
-- committed before they are used, so they have a migration of their own.

alter type public.notification_kind add value if not exists 'invoice_due_soon';
alter type public.notification_kind add value if not exists 'follow_up_due';
alter type public.notification_kind add value if not exists 'vendor_bill_due';
alter type public.notification_kind add value if not exists 'reimbursement_submitted';
alter type public.notification_kind add value if not exists 'reimbursement_decided';
alter type public.notification_kind add value if not exists 'reimbursement_paid';
