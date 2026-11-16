// Quotation numbers follow the prefix and next number set in Finance settings, never
// repeat, and never change once given. The Founder and Co-Founder's capacity is not
// tracked on the Workload page.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const items = [{ description: 'Monthly SEO', hsn_sac: '', quantity: 1, unit_price: 15000, tax_rate: 18 }];

describe('quotation numbering', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    const { data } = await admin.from('clients').insert({ company_name: `Numbering client ${runId}`, client_manager_id: ids.manager!, status: 'active' } as never).select('id').single();
    clientId = data!.id;
  });

  async function newQuotationNumber() {
    const { data: id, error } = await as.manager!.rpc('save_quotation', {
      p_quotation: null as unknown as string,
      p_values: { client_id: clientId, title: 'SEO retainer' },
      p_items: items,
    });
    expect(error).toBeNull();
    const { data } = await admin.from('quotations').select('quotation_number').eq('id', id!).single();
    return data!.quotation_number;
  }

  it('uses the prefix and next number from the settings', async () => {
    expect((await as.founder!.from('finance_settings').update({ quotation_prefix: 'BMU' }).eq('id', true).select('id')).data).toHaveLength(1);
    expect((await as.founder!.rpc('set_next_quotation_number', { p_next: 150 })).error).toBeNull();
    expect(await as.founder!.rpc('get_next_quotation_number')).toMatchObject({ data: 150 });

    expect(await newQuotationNumber()).toBe('BMU-0150');
    expect(await newQuotationNumber()).toBe('BMU-0151');
  });

  it('skips a number already used, so none repeats', async () => {
    await as.founder!.rpc('set_next_quotation_number', { p_next: 150 });
    expect(await newQuotationNumber()).toBe('BMU-0152');
  });

  it('never changes a number once given', async () => {
    const { data } = await admin.from('quotations').select('id').eq('quotation_number', 'BMU-0150').single();
    const { error } = await as.manager!.from('quotations').update({ quotation_number: 'BMU-0001' }).eq('id', data!.id);
    expect(error).not.toBeNull();
  });

  it('lets only finance managers set the next number', async () => {
    expect((await as.manager!.rpc('set_next_quotation_number', { p_next: 5 })).error?.code).toBe('42501');
    expect((await as.manager!.rpc('get_next_quotation_number')).error?.code).toBe('42501');
    expect((await as.founder!.rpc('set_next_quotation_number', { p_next: 0 })).error).not.toBeNull();
  });

  it('leaves the Founder off the Workload page, and shows them everyone else', async () => {
    const { data } = await as.founder!.rpc('get_workload_rows');
    const seen = new Set((data ?? []).map((row) => row.employee_id));
    expect(seen.has(ids.founder!)).toBe(false);
    expect(seen.has(ids.manager!)).toBe(true);
    expect(seen.has(ids.designer!)).toBe(true);
    expect((await as.founder!.rpc('get_my_workload_rows')).data).toEqual([]);
    expect((await as.designer!.rpc('get_my_workload_rows')).data).toHaveLength(1);
  });
});
