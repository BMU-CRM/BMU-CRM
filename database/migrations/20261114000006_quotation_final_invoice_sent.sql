-- Quotations get a Final step, and invoices a separate "sent" mark, as the owner asked.
--
-- * Quotations: draft (printed with a DRAFT mark) -> final (locked, printed clean) ->
--   sent (the date it was sent is recorded) -> accepted or declined. Final can go back
--   to draft to be changed, and sent back to final. A quotation can no longer be marked
--   as sent straight from draft, and only drafts can be changed (before, sent ones
--   could be changed too).
-- * Invoices: issuing still gives the number and removes the DRAFT mark. Marking it as
--   sent is a separate step that records the date.

alter type public.quotation_status add value if not exists 'final' before 'sent';

alter table public.invoices add column sent_at timestamptz;

create or replace function public.guard_quotation_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_internal boolean := public.finance_internal_write();
  v_settings public.finance_settings;
  v_client public.clients;
begin
  select * into v_settings from public.finance_settings;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.sent_at := null;
    new.decided_at := null;
    new.invoice_id := null;
    if not v_internal then
      new.subtotal := 0;
      new.tax_total := 0;
    end if;
    new.terms := coalesce(new.terms, v_settings.quotation_terms);
    perform public.check_finance_links(new.client_id, new.project_id);
  else
    if new.quotation_number is distinct from old.quotation_number
       or new.sent_at is distinct from old.sent_at
       or new.decided_at is distinct from old.decided_at
       or (new.invoice_id is distinct from old.invoice_id and not v_internal and pg_trigger_depth() < 2) then
      raise exception 'This field cannot be changed.' using errcode = 'insufficient_privilege';
    end if;
    if not v_internal then
      new.subtotal := old.subtotal;
      new.tax_total := old.tax_total;
    end if;

    -- Only a draft can be changed. Final and sent quotations are locked; move them back
    -- to draft to change them.
    if old.status <> 'draft' and (
      new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id
      or new.title is distinct from old.title or new.issue_date is distinct from old.issue_date
      or new.valid_until is distinct from old.valid_until or new.bill_to_name is distinct from old.bill_to_name
      or new.bill_to_address is distinct from old.bill_to_address or new.client_gstin is distinct from old.client_gstin
      or new.place_of_supply is distinct from old.place_of_supply or new.notes is distinct from old.notes
      or new.terms is distinct from old.terms or new.subtotal is distinct from old.subtotal
      or new.tax_total is distinct from old.tax_total
    ) then
      raise exception 'Only a draft quotation can be changed. Move it back to draft first.' using errcode = 'check_violation';
    end if;

    if new.client_id is distinct from old.client_id
       and not public.finance_reach('quotations.manage', new.client_id, null) then
      raise exception 'You cannot prepare quotations for this client.' using errcode = 'insufficient_privilege';
    end if;
    if new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id then
      perform public.check_finance_links(new.client_id, new.project_id);
    end if;

    if new.status is distinct from old.status then
      -- Draft, then final (the clean copy to send), then sent: two separate steps.
      if old.status = 'draft' and new.status = 'final' then
        if old.subtotal + old.tax_total <= 0
           or not exists (select 1 from public.quotation_items where quotation_id = new.id) then
          raise exception 'Add at least one item with an amount before finalising.' using errcode = 'check_violation';
        end if;
      elsif old.status = 'final' and new.status = 'draft' then
        null;
      elsif old.status = 'final' and new.status = 'sent' then
        new.sent_at := now();
      elsif old.status = 'sent' and new.status = 'final' then
        new.sent_at := null;
      elsif old.status = 'sent' and new.status in ('accepted', 'declined') then
        new.decided_at := now();
      elsif (old.status in ('sent', 'declined') and new.status = 'draft')
            or (old.status = 'accepted' and new.status = 'sent' and old.invoice_id is null) then
        new.decided_at := null;
        if new.status = 'draft' then
          new.sent_at := null;
        end if;
      else
        raise exception 'You cannot move this quotation from % to %.', old.status, new.status
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' or old.status = 'draft' then
    select * into v_client from public.clients where id = new.client_id;
    new.bill_to_name := coalesce(nullif(trim(new.bill_to_name), ''), v_client.company_name);
    new.bill_to_address := coalesce(nullif(trim(new.bill_to_address), ''), v_client.address);
    new.client_gstin := coalesce(nullif(upper(trim(new.client_gstin)), ''), v_client.gstin);
    new.place_of_supply := coalesce(nullif(trim(new.place_of_supply), ''), v_client.billing_state);
    new.valid_until := coalesce(new.valid_until, new.issue_date + v_settings.quotation_validity_days);
  end if;
  return new;
end;
$$;

-- Saving a quotation: as before, but only drafts (final and sent ones are locked).
create or replace function public.save_quotation(p_quotation uuid, p_values jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.quotations;
  v_id uuid := p_quotation;
  v_client uuid := (p_values ->> 'client_id')::uuid;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
  v_signer uuid;
  v_seal boolean;
begin
  if public.current_employee_id() is null then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  v_items := public.normalize_items(p_items);
  select coalesce(sum(l.taxable_amount), 0), coalesce(sum(l.tax_amount), 0)
    into v_subtotal, v_tax
  from public.item_lines(v_items) as l;

  perform set_config('app.finance_internal', 'on', true);

  if v_id is null then
    if not public.finance_reach('quotations.manage', v_client, null) then
      raise exception 'You cannot prepare quotations for this client.' using errcode = 'insufficient_privilege';
    end if;
    select a.signed_by, a.show_seal into v_signer, v_seal
    from public.apply_document_signature(p_values ->> 'signature', (p_values ->> 'show_seal')::boolean, null, false) as a;
    insert into public.quotations (
      client_id, project_id, title, issue_date, valid_until, bill_to_name, bill_to_address,
      client_gstin, place_of_supply, notes, terms, subtotal, tax_total, signed_by, show_seal
    ) values (
      v_client, (p_values ->> 'project_id')::uuid, p_values ->> 'title',
      coalesce((p_values ->> 'issue_date')::date, public.india_today()), (p_values ->> 'valid_until')::date,
      p_values ->> 'bill_to_name', p_values ->> 'bill_to_address', p_values ->> 'client_gstin',
      p_values ->> 'place_of_supply', p_values ->> 'notes', p_values ->> 'terms', v_subtotal, v_tax, v_signer, v_seal
    )
    returning id into v_id;
  else
    select * into v_existing from public.quotations where id = v_id for update;
    if not found or not public.can_manage_quotation_row(v_existing) then
      raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'Only a draft quotation can be changed. Move it back to draft first.' using errcode = 'check_violation';
    end if;
    select a.signed_by, a.show_seal into v_signer, v_seal
    from public.apply_document_signature(p_values ->> 'signature', (p_values ->> 'show_seal')::boolean, v_existing.signed_by, v_existing.show_seal) as a;
    update public.quotations set
      client_id = v_client,
      project_id = (p_values ->> 'project_id')::uuid,
      title = p_values ->> 'title',
      issue_date = coalesce((p_values ->> 'issue_date')::date, issue_date),
      valid_until = (p_values ->> 'valid_until')::date,
      bill_to_name = p_values ->> 'bill_to_name',
      bill_to_address = p_values ->> 'bill_to_address',
      client_gstin = p_values ->> 'client_gstin',
      place_of_supply = p_values ->> 'place_of_supply',
      notes = p_values ->> 'notes',
      terms = p_values ->> 'terms',
      subtotal = v_subtotal,
      tax_total = v_tax,
      signed_by = v_signer,
      show_seal = v_seal
    where id = v_id;
    delete from public.quotation_items where quotation_id = v_id;
  end if;

  insert into public.quotation_items (
    quotation_id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount,
    service_group, service_name, billing
  )
  select v_id, l.position, l.description, l.hsn_sac, l.quantity, l.unit_price, l.tax_rate, l.taxable_amount, l.tax_amount,
    nullif(trim(x.item ->> 'service_group'), ''), nullif(trim(x.item ->> 'service_name'), ''), nullif(x.item ->> 'billing', '')
  from public.item_lines(v_items) as l
  join jsonb_array_elements(p_items) with ordinality as x (item, position) on x.position = l.position;

  perform set_config('app.finance_internal', 'off', true);
  return v_id;
end;
$$;

-- Marks an issued invoice as sent to the client, or takes the mark off.
create function public.mark_invoice_sent(p_invoice uuid, p_sent boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = p_invoice for update;
  if not found or not public.can_manage_invoice_row(v_invoice) then
    raise exception 'You do not have permission to do this.' using errcode = 'insufficient_privilege';
  end if;
  if v_invoice.status in ('draft', 'cancelled') then
    raise exception 'Issue the invoice before marking it as sent.' using errcode = 'check_violation';
  end if;
  update public.invoices
  set sent_at = case when p_sent then coalesce(sent_at, now()) else null end
  where id = p_invoice;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.mark_invoice_sent(uuid, boolean) to authenticated;
grant execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated;
