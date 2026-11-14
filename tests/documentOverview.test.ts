// The project overview on quotations and invoices: up to three lines, changed only on a
// draft, and carried from a quotation to its invoice.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFinanceDocument } from '@/lib/validation/financeSchema';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const items = [{ description: 'Monthly SEO', hsn_sac: '', quantity: 1, unit_price: 15000, tax_rate: 18 }];

describe('project overview', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    const { data } = await admin.from('clients').insert({ company_name: `Overview client ${runId}`, client_manager_id: ids.manager!, status: 'active' } as never).select('id').single();
    clientId = data!.id;
  });

  it('allows up to three lines', () => {
    const form = (overview: string) => {
      const data = new FormData();
      data.set('clientId', clientId);
      data.set('title', 'SEO');
      data.set('issueDate', '2026-11-14');
      data.set('overview', overview);
      return data;
    };
    const ok = readFinanceDocument(form('One\r\nTwo\r\nThree'));
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    expect(readFinanceDocument(form('One\nTwo\nThree\nFour')).success).toBe(false);
  });

  it('is kept on a draft, locked once final, and carried to the invoice', async () => {
    const { data: id } = await as.manager!.rpc('save_quotation', {
      p_quotation: null as unknown as string,
      p_values: { client_id: clientId, title: 'SEO retainer' },
      p_items: items,
    });
    const overview = 'Local SEO for three branches.\nMonthly reports.';
    const saved = await as.manager!.from('quotations').update({ overview }).eq('id', id!).select('overview');
    expect(saved.data).toEqual([{ overview }]);

    const tooLong = await as.manager!.from('quotations').update({ overview: 'a\nb\nc\nd' }).eq('id', id!).select('id');
    expect(tooLong.error?.code).toBe('23514');

    for (const status of ['final', 'sent', 'accepted'] as const) {
      await as.manager!.from('quotations').update({ status }).eq('id', id!).select('id');
    }
    const locked = await as.manager!.from('quotations').update({ overview: 'Changed' }).eq('id', id!).select('id');
    expect(locked.error?.message).toContain('only be changed on a draft');

    const { data: invoiceId, error } = await as.manager!.rpc('create_invoice_from_quotation', { p_quotation: id! });
    expect(error).toBeNull();
    expect((await admin.from('invoices').select('overview').eq('id', invoiceId!).single()).data?.overview).toBe(overview);
  });
});
