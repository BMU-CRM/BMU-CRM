-- Phase 5 permissions and grants.

insert into public.permissions (key, module, label, description, allowed_scopes, sort_order) values
  ('quotations.view', 'Finance', 'View quotations', 'See quotations for the clients you manage, or for every client.', '{own,organisation}', 1000),
  ('quotations.manage', 'Finance', 'Prepare quotations', 'Create, edit and send quotations, and record the client''s answer.', '{own,organisation}', 1010),
  ('invoices.view', 'Finance', 'View invoices', 'See invoices and payments for the clients you manage, or for every client.', '{own,organisation}', 1020),
  ('invoices.manage', 'Finance', 'Prepare and issue invoices', 'Create, issue and cancel invoices.', '{own,organisation}', 1030),
  ('payments.record', 'Finance', 'Record payments', 'Record payments received, and remove ones entered by mistake.', '{organisation}', 1040),
  ('finance.reports', 'Finance', 'View finance reports', 'See revenue, collections, money owed and GST summaries.', '{organisation}', 1050),
  ('finance.manage', 'Finance', 'Manage finance settings', 'Set the company''s billing details, invoice numbering and default terms.', '{organisation}', 1060);

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, p.key, p.allowed_scopes[array_upper(p.allowed_scopes, 1)]
from public.roles r
cross join public.permissions p
where r.name = 'Founder' and p.sort_order >= 1000;

insert into public.role_permissions (role_id, permission_key, scope)
select r.id, m.permission_key, m.scope::public.permission_scope
from (values
  ('Co-Founder', 'quotations.view', 'organisation'),
  ('Co-Founder', 'quotations.manage', 'organisation'),
  ('Co-Founder', 'invoices.view', 'organisation'),
  ('Co-Founder', 'invoices.manage', 'organisation'),
  ('Co-Founder', 'payments.record', 'organisation'),
  ('Co-Founder', 'finance.reports', 'organisation'),
  ('Co-Founder', 'finance.manage', 'organisation'),
  ('Finance Head', 'quotations.view', 'organisation'),
  ('Finance Head', 'quotations.manage', 'organisation'),
  ('Finance Head', 'invoices.view', 'organisation'),
  ('Finance Head', 'invoices.manage', 'organisation'),
  ('Finance Head', 'payments.record', 'organisation'),
  ('Finance Head', 'finance.reports', 'organisation'),
  ('Finance Head', 'finance.manage', 'organisation'),
  ('Client Manager', 'quotations.view', 'own'),
  ('Client Manager', 'quotations.manage', 'own'),
  ('Client Manager', 'invoices.view', 'own'),
  ('Client Manager', 'invoices.manage', 'own')
) as m (role_name, permission_key, scope)
join public.roles r on r.name = m.role_name;

-- ---------------------------------------------------------------------------
-- Grants. New tables and functions are open by default, so close them again.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant select, update on public.finance_settings to authenticated;
revoke insert, delete, truncate on public.finance_settings from authenticated;
grant select, insert, update, delete on public.quotations to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
revoke truncate on public.quotations, public.invoices from authenticated;
grant select, insert, delete on public.payments to authenticated;
revoke update, truncate on public.payments from authenticated;
-- Items change only through the save functions, which recalculate the totals.
grant select on public.quotation_items, public.invoice_items to authenticated;
revoke insert, update, delete, truncate on public.quotation_items, public.invoice_items from authenticated;
revoke all on public.invoice_number_counters from authenticated;
grant usage on sequence public.quotation_code_sequence to authenticated;

grant execute on function public.finance_reach(text, uuid, uuid) to authenticated;
grant execute on function public.can_manage_quotation_row(public.quotations) to authenticated;
grant execute on function public.can_view_quotation_row(public.quotations) to authenticated;
grant execute on function public.can_view_quotation(uuid) to authenticated;
grant execute on function public.can_manage_invoice_row(public.invoices) to authenticated;
grant execute on function public.can_view_invoice_row(public.invoices) to authenticated;
grant execute on function public.can_view_invoice(uuid) to authenticated;
grant execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_invoice(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.create_invoice_from_quotation(uuid) to authenticated;
grant execute on function public.line_taxable_amount(numeric, numeric) to authenticated;
grant execute on function public.line_tax_amount(numeric, numeric) to authenticated;
grant execute on function public.format_rupees(numeric) to authenticated;
grant execute on function public.finance_internal_write() to authenticated;
-- Re-granted, because the function was replaced to hide money from people without access.
grant execute on function public.get_client_timeline(uuid, integer) to authenticated;

-- Not callable through the API.
revoke execute on function public.send_invoice_overdue_reminders() from authenticated;
revoke execute on function public.check_finance_links(uuid, uuid) from authenticated;
revoke execute on function public.normalize_items(jsonb) from authenticated;
revoke execute on function public.item_lines(jsonb) from authenticated;

alter publication live_updates add table public.quotations;
alter publication live_updates add table public.invoices;
