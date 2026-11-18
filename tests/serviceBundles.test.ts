// Bundles in the price list: a named set of sub services whose plan prices are their
// sub services' prices added up, less the saving. A bundle goes on a quotation as one
// item billed as "bundle". Quotations and invoices can also leave GST out.
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleDescription, bundlePlanPrice } from '@/lib/catalog/servicePricing';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('service bundles', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    const { data } = await admin.from('clients').insert({ company_name: `Bundle client ${runId}`, client_manager_id: ids.manager!, status: 'active' } as never).select('id').single();
    clientId = data!.id;
  });

  async function bundleWithServices(name: string) {
    const { data: bundle } = await admin.from('service_bundles').select('name, service_ids, saving_percent').eq('name', name).single();
    const { data: services } = await admin.from('services').select('id, name, starter_price, growth_price, premium_price').in('id', bundle!.service_ids);
    const ordered = bundle!.service_ids.map((id) => services!.find((service) => service.id === id)!);
    return { bundle: bundle!, services: ordered };
  }

  it('comes with the company bundles, their sub services in order', async () => {
    const { data } = await admin.from('service_bundles').select('name').order('sort_order');
    expect(data!.map((row) => row.name)).toEqual([
      'Brand Launch',
      'Business AI',
      'Complete Digital Growth',
      'Digital Presence',
      'Founder Brand',
      'Local Business Growth',
      'Social Growth',
      'UGC Growth',
    ]);
    const { services } = await bundleWithServices('Brand Launch');
    expect(bundleDescription(services.map((service) => service.name))).toBe('Complete Branding + Graphic Designing + Website Design & Development');
  });

  it('prices each plan as its sub services added up, less the saving', async () => {
    const expected: Record<string, [number, number, number]> = {
      'Brand Launch': [67500, 139500, 283500],
      'Business AI': [54000, 121500, 247500],
      'Complete Digital Growth': [150300, 306000, 594000],
      'Digital Presence': [65250, 135000, 247500],
      'Founder Brand': [62100, 121500, 216000],
      'Local Business Growth': [62550, 121500, 216000],
      'Social Growth': [55800, 108000, 193500],
      'UGC Growth': [58500, 108000, 216000],
    };
    for (const [name, prices] of Object.entries(expected)) {
      const { bundle, services } = await bundleWithServices(name);
      const plan = (key: 'starter_price' | 'growth_price' | 'premium_price') =>
        bundlePlanPrice(services.map((service) => (service[key] === null ? null : Number(service[key]))), Number(bundle.saving_percent));
      expect([plan('starter_price'), plan('growth_price'), plan('premium_price')], name).toEqual(prices);
    }
  });

  it('offers no price for a plan a sub service has no price for', () => {
    expect(bundlePlanPrice([15000, null], 10)).toBeNull();
    expect(bundlePlanPrice([10000.5, 0.25], 0)).toBe(10000.75);
  });

  it('lets only those who manage the price list change bundles', async () => {
    const { data: services } = await admin.from('services').select('id').eq('is_active', true).limit(2);
    const row = { name: `Test bundle ${runId}`, service_ids: services!.map((service) => service.id) };

    const refused = await as.manager!.from('service_bundles').insert(row).select('id');
    expect(refused.data ?? []).toHaveLength(0);

    const added = await as.founder!.from('service_bundles').insert(row).select('id').single();
    expect(added.error).toBeNull();
    const renamed = await as.founder!.from('service_bundles').update({ saving_percent: 15 }).eq('id', added.data!.id).select('saving_percent');
    expect(renamed.data).toEqual([{ saving_percent: 15 }]);
  });

  it('refuses a sub service twice or one not in the price list', async () => {
    const { data: services } = await admin.from('services').select('id').limit(1);
    const id = services![0]!.id;
    const twice = await as.founder!.from('service_bundles').insert({ name: `Twice ${runId}`, service_ids: [id, id] }).select('id');
    expect(twice.error?.message).toMatch(/once/);
    const unknown = await as.founder!.from('service_bundles').insert({ name: `Unknown ${runId}`, service_ids: [id, crypto.randomUUID()] }).select('id');
    expect(unknown.error?.message).toMatch(/price list/);
  });

  it('saves a bundle as one item billed as a bundle, and a quotation without GST', async () => {
    const { data: id, error } = await as.manager!.rpc('save_quotation', {
      p_quotation: null as unknown as string,
      p_values: { client_id: clientId, title: 'Brand Launch' },
      p_items: [
        {
          description: 'Complete Branding + Graphic Designing + Website Design & Development',
          hsn_sac: '',
          quantity: 1,
          unit_price: 67500,
          tax_rate: 0,
          service_group: '',
          service_name: 'Brand Launch (Starter plan)',
          billing: 'bundle',
        },
      ],
    });
    expect(error).toBeNull();
    const { data: quotation } = await admin.from('quotations').select('subtotal, tax_total, cgst_total, sgst_total, total').eq('id', id!).single();
    expect(quotation).toMatchObject({ subtotal: 67500, tax_total: 0, cgst_total: 0, sgst_total: 0, total: 67500 });
    const { data: items } = await admin.from('quotation_items').select('billing, service_name').eq('quotation_id', id!);
    expect(items).toEqual([{ billing: 'bundle', service_name: 'Brand Launch (Starter plan)' }]);
  });
});
