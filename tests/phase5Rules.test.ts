// Quotations, invoices and payments, tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, createTestPeople, type Client } from './helpers/testDatabase';

const runId = Date.now();

function indiaDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function financialYear(isoDate: string) {
  const [year = 0, month = 0] = isoDate.split('-').map(Number);
  const start = month < 4 ? year - 1 : year;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const items = [
  { description: 'Website design', hsn_sac: '998314', quantity: 2, unit_price: 1000, tax_rate: 18 },
  { description: 'Hosting', hsn_sac: '', quantity: 1, unit_price: 500, tax_rate: 5 },
];

describe('quotations, invoices and payments', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let ownClient = '';
  let otherClient = '';
  let designClient = '';

  function values(clientId: string, extra: Record<string, unknown> = {}) {
    return { client_id: clientId, title: 'Website redesign', ...extra };
  }

  async function saveInvoice(actor: Client, clientId: string, extra: Record<string, unknown> = {}, invoiceId: string | null = null) {
    return actor.rpc('save_invoice', { p_invoice: invoiceId as string, p_values: values(clientId, extra), p_items: items });
  }

  async function issuedInvoice(extra: Record<string, unknown> = {}) {
    const { data: id, error } = await saveInvoice(as.manager!, ownClient, extra);
    if (error) throw error;
    const issued = await as.manager!.from('invoices').update({ status: 'issued' }).eq('id', id!).select('*').single();
    if (issued.error) throw issued.error;
    return issued.data;
  }

  async function notificationKinds(key: string) {
    const { data } = await admin.from('notifications').select('kind, title, body').eq('recipient_id', ids[key]!);
    return data ?? [];
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('financeHead', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('otherManager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('employee', 'Employee', 'Design & Development', 'designHead');

    const designDepartment = await people.departmentId('Design & Development');
    const insert = async (name: string, managerKey: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await admin
        .from('clients')
        .insert({ company_name: `${name} ${runId}`, client_manager_id: ids[managerKey]!, status: 'active', ...extra } as never)
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    };
    ownClient = await insert('Own client', 'manager', { address: '1 MG Road, Pune', billing_state: 'Maharashtra' });
    otherClient = await insert('Other client', 'otherManager', { billing_state: 'Karnataka' });
    designClient = await insert('Design client', 'manager', { department_id: designDepartment });

    const settings = await admin.from('finance_settings').update({ state: 'Maharashtra', legal_name: 'Test Agency' }).eq('id', true);
    if (settings.error) throw settings.error;
  });

  it('keeps money private from anonymous visitors', async () => {
    for (const table of ['quotations', 'invoices', 'payments', 'finance_settings'] as const) {
      const { error } = await anonymousClient().from(table).select('*').limit(1);
      expect(error?.code, table).toBe('42501');
    }
  });

  describe('quotations', () => {
    let quotationId = '';

    it('works out the totals and GST from the items', async () => {
      const { data: id, error } = await as.manager!.rpc('save_quotation', {
        p_quotation: null as unknown as string,
        p_values: values(ownClient),
        p_items: items,
      });
      expect(error).toBeNull();
      quotationId = id!;

      const { data } = await as.manager!.from('quotations').select('*').eq('id', quotationId).single();
      expect(data).toMatchObject({
        status: 'draft',
        subtotal: 2500,
        tax_total: 385,
        cgst_total: 192.5,
        sgst_total: 192.5,
        igst_total: 0,
        total: 2885,
        is_inter_state: false,
        bill_to_name: `Own client ${runId}`,
        bill_to_address: '1 MG Road, Pune',
        place_of_supply: 'Maharashtra',
      });
      expect(data?.quotation_number).toMatch(/^QUO-\d{4}$/);
      expect(data?.valid_until).toBe(indiaDate(30));
    });

    it('charges IGST to a client in another state', async () => {
      const { data: id } = await as.otherManager!.rpc('save_quotation', {
        p_quotation: null as unknown as string,
        p_values: values(otherClient),
        p_items: items,
      });
      const { data } = await as.otherManager!.from('quotations').select('is_inter_state, igst_total, cgst_total, total').eq('id', id!).single();

      expect(data).toEqual({ is_inter_state: true, igst_total: 385, cgst_total: 0, total: 2885 });
    });

    it('ignores forged totals and refuses items written directly', async () => {
      await as.manager!.from('quotations').update({ total: 1, subtotal: 1, tax_total: 0 } as never).eq('id', quotationId);
      const { data } = await as.manager!.from('quotations').select('total').eq('id', quotationId).single();
      const direct = await as.manager!.from('quotation_items').insert({
        quotation_id: quotationId, position: 9, description: 'Free money', quantity: 1, unit_price: 1, tax_rate: 0, taxable_amount: 1, tax_amount: 0,
      });

      expect(data?.total).toBe(2885);
      expect(direct.error?.code).toBe('42501');
    });

    it('lets a Client Manager quote only for their own clients', async () => {
      const { error } = await as.manager!.rpc('save_quotation', {
        p_quotation: null as unknown as string,
        p_values: values(otherClient),
        p_items: items,
      });
      const { data: seen } = await as.manager!.from('quotations').select('id').eq('client_id', otherClient);

      expect(error?.message).toContain('cannot prepare quotations for this client');
      expect(seen).toEqual([]);
    });

    it('hides quotations from people without finance access', async () => {
      const { data } = await as.employee!.from('quotations').select('id');
      const { error } = await as.employee!.rpc('save_quotation', {
        p_quotation: null as unknown as string,
        p_values: values(ownClient),
        p_items: items,
      });

      expect(data).toEqual([]);
      expect(error?.code).toBe('42501');
    });

    it('follows the workflow, and becomes an invoice once accepted', async () => {
      const early = await as.manager!.rpc('create_invoice_from_quotation', { p_quotation: quotationId });
      expect(early.error?.message).toContain('Only an accepted quotation');

      // Sending is its own step after finalising; a draft cannot be marked as sent.
      const straightToSent = await as.manager!.from('quotations').update({ status: 'sent' }).eq('id', quotationId);
      expect(straightToSent.error?.message).toContain('from draft to sent');

      for (const status of ['final', 'sent', 'accepted'] as const) {
        const { error } = await as.manager!.from('quotations').update({ status }).eq('id', quotationId);
        expect(error, status).toBeNull();
      }
      const locked = await as.manager!.from('quotations').update({ title: 'Changed later' }).eq('id', quotationId);
      expect(locked.error?.message).toContain('Only a draft quotation');

      const { data: invoiceId, error } = await as.manager!.rpc('create_invoice_from_quotation', { p_quotation: quotationId });
      expect(error).toBeNull();
      const again = await as.manager!.rpc('create_invoice_from_quotation', { p_quotation: quotationId });
      expect(again.error?.message).toContain('already has an invoice');

      const { data: invoice } = await as.manager!.from('invoices').select('status, total, quotation_id, invoice_number').eq('id', invoiceId!).single();
      const { count } = await as.manager!.from('invoice_items').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId!);
      expect(invoice).toEqual({ status: 'draft', total: 2885, quotation_id: quotationId, invoice_number: null });
      expect(count).toBe(2);
    });

    it('rounds figures to paise before working out the totals', async () => {
      const { data: id } = await as.manager!.rpc('save_quotation', {
        p_quotation: null as unknown as string,
        p_values: values(ownClient),
        p_items: [{ description: 'Hours', quantity: 1.333, unit_price: 100, tax_rate: 18 }],
      });
      const { data: line } = await as.manager!.from('quotation_items').select('quantity, taxable_amount, tax_amount').eq('quotation_id', id!).single();
      const { data: quotation } = await as.manager!.from('quotations').select('subtotal, total').eq('id', id!).single();

      expect(line).toEqual({ quantity: 1.33, taxable_amount: 133, tax_amount: 23.94 });
      expect(quotation).toEqual({ subtotal: 133, total: 156.94 });
    });

    it('cannot be finalised without an amount', async () => {
      const { data: id } = await as.manager!.rpc('save_quotation', {
        p_quotation: null as unknown as string,
        p_values: values(ownClient),
        p_items: [{ description: 'Free consultation', quantity: 1, unit_price: 0, tax_rate: 18 }],
      });
      const { error } = await as.manager!.from('quotations').update({ status: 'final' }).eq('id', id!);

      expect(error?.message).toContain('Add at least one item with an amount');
    });
  });

  describe('invoices', () => {
    it('numbers an invoice only when it is issued, in the financial year series', async () => {
      const first = await issuedInvoice();
      const second = await issuedInvoice();
      const fy = financialYear(indiaDate());

      expect(first.invoice_number).toMatch(new RegExp(`^INV/${fy}/\\d{4}$`));
      const firstNumber = Number(first.invoice_number!.slice(-4));
      expect(Number(second.invoice_number!.slice(-4))).toBe(firstNumber + 1);
      expect(first.due_date).toBe(indiaDate(15));
      expect(first.issued_at).not.toBeNull();
    });

    it('locks an issued invoice', async () => {
      const invoice = await issuedInvoice();

      const edit = await as.manager!.from('invoices').update({ title: 'Something else' }).eq('id', invoice.id);
      const resave = await saveInvoice(as.manager!, ownClient, {}, invoice.id);
      const renumber = await as.manager!.from('invoices').update({ invoice_number: 'INV/00-01/9999' }).eq('id', invoice.id);
      const remove = await as.manager!.from('invoices').delete().eq('id', invoice.id).select('id');

      expect(edit.error?.message).toContain('An issued invoice cannot be changed');
      expect(resave.error?.message).toContain('An issued invoice cannot be changed');
      expect(renumber.error?.code).toBe('42501');
      expect(remove.data).toEqual([]);
    });

    it('refuses an invoice dated in the future', async () => {
      const { data: id } = await saveInvoice(as.manager!, ownClient, { issue_date: indiaDate(3), due_date: indiaDate(20) });
      const { error } = await as.manager!.from('invoices').update({ status: 'issued' }).eq('id', id!);

      expect(error?.message).toContain('cannot be in the future');
    });

    it('lets a draft be deleted', async () => {
      const { data: id } = await saveInvoice(as.manager!, ownClient);
      const { data } = await as.manager!.from('invoices').delete().eq('id', id!).select('id');

      expect(data).toHaveLength(1);
    });

    it('keeps one Client Manager out of another\'s invoices', async () => {
      const invoice = await issuedInvoice();
      const { data } = await as.otherManager!.from('invoices').select('id').eq('id', invoice.id);
      const { error } = await saveInvoice(as.otherManager!, ownClient);

      expect(data).toEqual([]);
      expect(error?.message).toContain('cannot bill this client');
    });

    it('refuses a project that belongs to another client', async () => {
      const { data: project } = await admin.from('projects').insert({ name: `Other project ${runId}`, client_id: otherClient }).select('id').single();
      const { error } = await saveInvoice(as.financeHead!, ownClient, { project_id: project!.id });

      expect(error?.message).toContain('project that belongs to this client');
    });
  });

  describe('payments', () => {
    it('tracks part and full payment, and tells the Client Manager', async () => {
      const invoice = await issuedInvoice();

      const part = await as.financeHead!.from('payments').insert({ invoice_id: invoice.id, amount: 1000, method: 'bank_transfer' });
      expect(part.error).toBeNull();
      expect((await admin.from('invoices').select('status, amount_paid').eq('id', invoice.id).single()).data).toEqual({
        status: 'partially_paid',
        amount_paid: 1000,
      });

      const tooMuch = await as.financeHead!.from('payments').insert({ invoice_id: invoice.id, amount: 5000, method: 'upi' });
      expect(tooMuch.error?.message).toContain('more than the ₹1,885.00 still due');

      const rest = await as.financeHead!.from('payments').insert({ invoice_id: invoice.id, amount: 1885, method: 'tds' });
      expect(rest.error).toBeNull();
      const paid = (await admin.from('invoices').select('status, amount_paid, paid_at').eq('id', invoice.id).single()).data;
      expect(paid?.status).toBe('paid');
      expect(paid?.paid_at).not.toBeNull();

      const kinds = await notificationKinds('manager');
      expect(kinds.some((n) => n.kind === 'payment_received' && n.title === 'An invoice is paid in full')).toBe(true);
    });

    it('lets only finance record payments', async () => {
      const invoice = await issuedInvoice();
      const { error } = await as.manager!.from('payments').insert({ invoice_id: invoice.id, amount: 100, method: 'cash' });

      expect(error?.code).toBe('42501');
    });

    it('refuses payments on a draft and payments dated in the future', async () => {
      const { data: draftId } = await saveInvoice(as.manager!, ownClient);
      const invoice = await issuedInvoice();

      const onDraft = await as.financeHead!.from('payments').insert({ invoice_id: draftId!, amount: 100, method: 'cash' });
      const future = await as.financeHead!.from('payments').insert({ invoice_id: invoice.id, amount: 100, method: 'cash', payment_date: indiaDate(5) });

      expect(onDraft.error?.message).toContain('issued invoice that is not fully paid');
      expect(future.error?.message).toContain('cannot be in the future');
    });

    it('cancels only with a reason, and only once payments are removed', async () => {
      const invoice = await issuedInvoice();
      const { data: payment } = await as.financeHead!.from('payments').insert({ invoice_id: invoice.id, amount: 500, method: 'cheque' }).select('id').single();

      const withPayment = await as.manager!.from('invoices').update({ status: 'cancelled', cancel_reason: 'Wrong amount' }).eq('id', invoice.id);
      expect(withPayment.error?.message).toContain('Remove the payments');

      await as.financeHead!.from('payments').delete().eq('id', payment!.id);
      expect((await admin.from('invoices').select('status, amount_paid').eq('id', invoice.id).single()).data).toEqual({
        status: 'issued',
        amount_paid: 0,
      });

      const noReason = await as.manager!.from('invoices').update({ status: 'cancelled' }).eq('id', invoice.id);
      const cancelled = await as.manager!.from('invoices').update({ status: 'cancelled', cancel_reason: 'Wrong amount' }).eq('id', invoice.id).select('status, cancelled_at, invoice_number').single();

      expect(noReason.error?.message).toContain('Give a reason');
      expect(cancelled.data?.status).toBe('cancelled');
      expect(cancelled.data?.invoice_number).toBe(invoice.invoice_number);
    });
  });

  describe('reminders and the client timeline', () => {
    it('reminds the Client Manager once when an invoice is overdue', async () => {
      const invoice = await issuedInvoice({ issue_date: indiaDate(-40), due_date: indiaDate(-10) });

      await admin.rpc('send_invoice_overdue_reminders');
      await admin.rpc('send_invoice_overdue_reminders');

      const overdue = (await notificationKinds('manager')).filter((n) => n.kind === 'invoice_overdue' && n.body?.includes(invoice.invoice_number!));
      expect(overdue).toHaveLength(1);
    });

    it('is not callable by signed-in users', async () => {
      const { error } = await as.financeHead!.rpc('send_invoice_overdue_reminders');

      expect(error).not.toBeNull();
    });

    it('shows money on the timeline only to people who may see it', async () => {
      const { data: id } = await saveInvoice(as.manager!, designClient);
      await as.manager!.from('invoices').update({ status: 'issued' }).eq('id', id!);

      // Another Client Manager can open any client, but not the money of one they do not manage.
      const manager = await as.manager!.rpc('get_client_timeline', { p_client: designClient });
      const otherManager = await as.otherManager!.rpc('get_client_timeline', { p_client: designClient });

      expect(manager.data?.some((entry) => entry.entity_type === 'invoices')).toBe(true);
      expect(otherManager.data?.length).toBeGreaterThan(0);
      expect(otherManager.data?.some((entry) => entry.entity_type === 'invoices')).toBe(false);
    });
  });

  describe('finance settings', () => {
    it('can be changed only by finance managers', async () => {
      const byManager = await as.manager!.from('finance_settings').update({ legal_name: 'Hijacked' }).eq('id', true).select('id');
      const byFinance = await as.financeHead!.from('finance_settings').update({ payment_terms_days: 15 }).eq('id', true).select('id');

      expect(byManager.data ?? []).toEqual([]);
      expect(byFinance.data).toHaveLength(1);
    });
  });
});
