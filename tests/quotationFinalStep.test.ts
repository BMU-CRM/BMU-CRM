// Quotations: draft, then final (the clean copy), then sent, as separate steps. Invoices:
// marked as sent on their own, after they are issued.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const items = [{ description: 'Monthly SEO', hsn_sac: '', quantity: 1, unit_price: 15000, tax_rate: 18 }];

describe('final quotations and sent invoices', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';

  async function newQuotation() {
    const { data, error } = await as.manager!.rpc('save_quotation', {
      p_quotation: null as unknown as string,
      p_values: { client_id: clientId, title: 'SEO retainer' },
      p_items: items,
    });
    if (error) throw error;
    return data as string;
  }
  const move = (id: string, status: 'draft' | 'final' | 'sent' | 'accepted') =>
    as.manager!.from('quotations').update({ status }).eq('id', id).select('status, sent_at');

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('employee', 'Employee', 'Design & Development', 'founder');
    const { data } = await admin.from('clients').insert({ company_name: `Final client ${runId}`, client_manager_id: ids.manager!, status: 'active' } as never).select('id').single();
    clientId = data!.id;
  });

  it('finalises without sending, and can go back to draft to be changed', async () => {
    const id = await newQuotation();
    const final = await move(id, 'final');
    expect(final.data).toEqual([{ status: 'final', sent_at: null }]);

    const edit = await as.manager!.rpc('save_quotation', { p_quotation: id, p_values: { client_id: clientId, title: 'Changed' }, p_items: items });
    expect(edit.error?.message).toContain('Only a draft quotation');

    expect((await move(id, 'draft')).error).toBeNull();
    const again = await as.manager!.rpc('save_quotation', { p_quotation: id, p_values: { client_id: clientId, title: 'Changed' }, p_items: items });
    expect(again.error).toBeNull();
  });

  it('records the sending date only when marked as sent, and can take it back', async () => {
    const id = await newQuotation();
    await move(id, 'final');
    const sent = await move(id, 'sent');
    expect(sent.data?.[0]?.status).toBe('sent');
    expect(sent.data?.[0]?.sent_at).not.toBeNull();

    const changeWhileSent = await as.manager!.from('quotations').update({ title: 'Quietly changed' }).eq('id', id);
    expect(changeWhileSent.error?.message).toContain('Only a draft quotation');

    const notSent = await move(id, 'final');
    expect(notSent.data).toEqual([{ status: 'final', sent_at: null }]);
  });

  it('marks an issued invoice as sent, separately from issuing', async () => {
    const { data: invoiceId } = await as.manager!.rpc('save_invoice', {
      p_invoice: null as unknown as string,
      p_values: { client_id: clientId, title: 'SEO, November' },
      p_items: items,
    });

    const early = await as.manager!.rpc('mark_invoice_sent', { p_invoice: invoiceId!, p_sent: true });
    expect(early.error?.message).toContain('Issue the invoice');

    await as.manager!.from('invoices').update({ status: 'issued' }).eq('id', invoiceId!).select('id');
    expect((await as.manager!.rpc('mark_invoice_sent', { p_invoice: invoiceId!, p_sent: true })).error).toBeNull();
    const { data: sent } = await admin.from('invoices').select('status, sent_at').eq('id', invoiceId!).single();
    expect(sent?.status).toBe('issued');
    expect(sent?.sent_at).not.toBeNull();

    const byEmployee = await as.employee!.rpc('mark_invoice_sent', { p_invoice: invoiceId!, p_sent: false });
    expect(byEmployee.error?.code).toBe('42501');

    await as.manager!.rpc('mark_invoice_sent', { p_invoice: invoiceId!, p_sent: false });
    expect((await admin.from('invoices').select('sent_at').eq('id', invoiceId!).single()).data?.sent_at).toBeNull();
  });
});
