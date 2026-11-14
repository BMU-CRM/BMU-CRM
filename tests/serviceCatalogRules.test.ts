// The services and industries clients choose from, tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('services and industries', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';
  let seo = '';
  let businessProfile = '';
  let videoEditing = '';

  async function serviceId(name: string) {
    return (await admin.from('services').select('id').eq('name', name).single()).data!.id;
  }

  async function currentServices(id: string) {
    const { data } = await admin.from('client_services').select('service_id, service_name, status').eq('client_id', id).neq('status', 'ended');
    return (data ?? []).map((row) => row.service_name).sort();
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('coFounder', 'Co-Founder', 'Management', 'founder');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('otherManager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('employee', 'Employee', 'Design & Development', 'founder');

    seo = await serviceId('SEO');
    businessProfile = await serviceId('Google Business Profile');
    videoEditing = await serviceId('Video Editing');
    const { data } = await as.manager!
      .from('clients')
      .insert({ company_name: `Catalog client ${runId}`, client_manager_id: ids.manager! })
      .select('id')
      .single();
    clientId = data!.id;
  });

  it('starts with the agreed lists', async () => {
    const groups = await admin.from('service_groups').select('name').order('sort_order');
    const services = await admin.from('services').select('id', { count: 'exact', head: true });
    const industries = await admin.from('industries').select('name');

    expect(groups.data?.map((group) => group.name)).toEqual([
      'Marketing & Visibility', 'Social & Personal Brand', 'UGC & Creator Marketing', 'Brand & Design', 'Web & AI', 'Content & Production',
    ]);
    // The 29 first sub services, plus 14 from the price list (the old ones are kept, hidden).
    expect(services.count).toBe(43);
    expect(industries.data).toHaveLength(58);
    expect(industries.data?.some((industry) => industry.name.endsWith('Marketing'))).toBe(false);
    expect(industries.data?.some((industry) => industry.name === 'Real Estate')).toBe(true);
  });

  it('has the price list: 22 sub services that can be chosen, each billed and priced', async () => {
    const { data: shown } = await admin.from('services').select('name, billing, starter_price, growth_price, premium_price').eq('is_active', true);
    const byName = new Map((shown ?? []).map((service) => [service.name, service]));
    const price = (name: string) => {
      const service = byName.get(name)!;
      return [service.billing, Number(service.starter_price), Number(service.growth_price), Number(service.premium_price)];
    };

    expect(shown).toHaveLength(22);
    expect((shown ?? []).every((service) => service.starter_price !== null && service.growth_price !== null && service.premium_price !== null)).toBe(true);
    expect(price('SEO')).toEqual(['monthly', 15000, 30000, 60000]);
    expect(price('ChatGPT Ads')).toEqual(['monthly', 20000, 40000, 75000]);
    expect(price('Social Media Management — Influencers')).toEqual(['monthly', 25000, 45000, 65000]);
    expect(price('Experiential Ads')).toEqual(['per_unit', 25000, 50000, 100000]);
    expect(price('Complete Branding')).toEqual(['one_time', 40000, 75000, 150000]);
    expect(price('Website Design & Development')).toEqual(['one_time', 25000, 60000, 125000]);
    expect(price('Podcast Shoots')).toEqual(['per_unit', 15000, 30000, 50000]);
  });

  it('renames the matching old sub services and hides the rest', async () => {
    const { data: old } = await admin
      .from('services')
      .select('name, is_active')
      .in('name', ['SEO (Search Engine Optimisation)', 'UGC Videos', 'Website Design', 'Local SEO', 'Photography', 'Website Development']);

    expect((old ?? []).map((service) => [service.name, service.is_active]).sort()).toEqual([
      ['Local SEO', false],
      ['Photography', false],
      ['Website Development', false],
    ]);
  });

  it('lets only those who manage the lists change prices', async () => {
    const byManager = await as.manager!.from('services').update({ starter_price: 1 }).eq('id', seo).select('id');
    const byFounder = await as.founder!.from('services').update({ starter_price: 16000 }).eq('id', seo).select('starter_price');
    const negative = await as.founder!.from('services').update({ growth_price: -1 }).eq('id', seo).select('id');
    const badBilling = await as.founder!.from('services').update({ billing: 'yearly' }).eq('id', seo).select('id');

    expect(byManager.data ?? []).toHaveLength(0);
    expect(Number(byFounder.data?.[0]?.starter_price)).toBe(16000);
    expect(negative.error?.code).toBe('23514');
    expect(badBilling.error?.code).toBe('23514');
    await as.founder!.from('services').update({ starter_price: 15000 }).eq('id', seo).select('id');
  });

  it('lets every signed-in person read the lists, but not anonymous visitors', async () => {
    const { data } = await as.employee!.from('industries').select('id').limit(1);
    const anonymous = await anonymousClient().from('services').select('id').limit(1);

    expect(data).toHaveLength(1);
    expect(anonymous.error?.code).toBe('42501');
  });

  it('lets only the Founder and Co-Founder change the lists', async () => {
    const byManager = await as.manager!.from('industries').insert({ name: `Manager industry ${runId}` });
    const byCoFounder = await as.coFounder!.from('industries').insert({ name: `Space Tech ${runId}` }).select('id').single();
    const rename = await as.founder!.from('industries').update({ name: `Space Technology ${runId}` }).eq('id', byCoFounder.data!.id).select('name');

    expect(byManager.error?.code).toBe('42501');
    expect(byCoFounder.error).toBeNull();
    expect(rename.data?.[0]?.name).toBe(`Space Technology ${runId}`);
  });

  it('sets a client\'s services in one step, with their names', async () => {
    const { error } = await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo, businessProfile] });

    expect(error).toBeNull();
    expect(await currentServices(clientId)).toEqual(['Google Business Profile', 'SEO']);
  });

  it('replaces the current services, and keeps ended ones as history', async () => {
    await admin.from('client_services').update({ status: 'ended' }).eq('client_id', clientId).eq('service_id', businessProfile);
    await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo, videoEditing] });

    const { data: ended } = await admin.from('client_services').select('id').eq('client_id', clientId).eq('status', 'ended');
    expect(await currentServices(clientId)).toEqual(['SEO', 'Video Editing']);
    expect(ended).toHaveLength(1);
  });

  it('keeps services typed in before the list existed', async () => {
    await admin.from('client_services').insert({ client_id: clientId, service_name: 'Old typed service', status: 'active' });
    await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo] });

    expect(await currentServices(clientId)).toEqual(['Old typed service', 'SEO']);
  });

  it('keeps the plan chosen for each service, and leaves it when none is given', async () => {
    const { error } = await as.manager!.rpc('set_client_services', {
      p_client: clientId,
      p_services: [seo, videoEditing],
      p_plans: { [seo]: 'growth', [videoEditing]: 'premium' },
    });
    expect(error).toBeNull();
    const plans = async () =>
      Object.fromEntries(
        ((await admin.from('client_services').select('service_id, plan').eq('client_id', clientId).neq('status', 'ended').not('service_id', 'is', null)).data ?? []).map(
          (row) => [row.service_id, row.plan],
        ),
      );
    expect(await plans()).toEqual({ [seo]: 'growth', [videoEditing]: 'premium' });

    // Saved again without plans (as the services panel does): the plans stay.
    await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo, videoEditing] });
    expect(await plans()).toEqual({ [seo]: 'growth', [videoEditing]: 'premium' });

    const wrong = await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo], p_plans: { [seo]: 'gold' } });
    expect(wrong.error?.message).toContain('Starter, Growth or Premium');
  });

  it('requires at least one service from the list', async () => {
    const none = await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [] });
    const unknown = await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: ['00000000-0000-0000-0000-000000000000'] });

    expect(none.error?.message).toContain('at least one service');
    expect(unknown.error?.message).toContain('from the list');
  });

  it('keeps other Client Managers out', async () => {
    const { error } = await as.otherManager!.rpc('set_client_services', { p_client: clientId, p_services: [seo] });

    expect(error?.code).toBe('42501');
  });

  it('lets whoever adds a client set its first services, even for another manager', async () => {
    const { data } = await as.otherManager!
      .from('clients')
      .insert({ company_name: `Handed over ${runId}`, client_manager_id: ids.manager! })
      .select('id')
      .single();

    const first = await as.otherManager!.rpc('set_client_services', { p_client: data!.id, p_services: [seo] });
    const later = await as.otherManager!.rpc('set_client_services', { p_client: data!.id, p_services: [videoEditing] });

    expect(first.error).toBeNull();
    expect(later.error?.code).toBe('42501');
  });

  it('keeps a service or industry that is in use', async () => {
    const service = await as.founder!.from('services').delete().eq('id', seo);
    const industry = (await admin.from('industries').select('id').eq('name', 'Real Estate').single()).data!.id;
    await admin.from('clients').update({ industry_id: industry }).eq('id', clientId);
    const removeIndustry = await as.founder!.from('industries').delete().eq('id', industry);

    expect(['23001', '23503']).toContain(service.error?.code);
    expect(['23001', '23503']).toContain(removeIndustry.error?.code);
  });
});
