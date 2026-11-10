// The services and industries clients choose from, tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { anonymousClient, createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('services and industries', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';
  let seo = '';
  let localSeo = '';
  let photography = '';

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

    seo = await serviceId('SEO (Search Engine Optimisation)');
    localSeo = await serviceId('Local SEO');
    photography = await serviceId('Photography');
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
    expect(services.count).toBe(29);
    expect(industries.data).toHaveLength(58);
    expect(industries.data?.some((industry) => industry.name.endsWith('Marketing'))).toBe(false);
    expect(industries.data?.some((industry) => industry.name === 'Real Estate')).toBe(true);
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
    const { error } = await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo, localSeo] });

    expect(error).toBeNull();
    expect(await currentServices(clientId)).toEqual(['Local SEO', 'SEO (Search Engine Optimisation)']);
  });

  it('replaces the current services, and keeps ended ones as history', async () => {
    await admin.from('client_services').update({ status: 'ended' }).eq('client_id', clientId).eq('service_id', localSeo);
    await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo, photography] });

    const { data: ended } = await admin.from('client_services').select('id').eq('client_id', clientId).eq('status', 'ended');
    expect(await currentServices(clientId)).toEqual(['Photography', 'SEO (Search Engine Optimisation)']);
    expect(ended).toHaveLength(1);
  });

  it('keeps services typed in before the list existed', async () => {
    await admin.from('client_services').insert({ client_id: clientId, service_name: 'Old typed service', status: 'active' });
    await as.manager!.rpc('set_client_services', { p_client: clientId, p_services: [seo] });

    expect(await currentServices(clientId)).toEqual(['Old typed service', 'SEO (Search Engine Optimisation)']);
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
    const later = await as.otherManager!.rpc('set_client_services', { p_client: data!.id, p_services: [photography] });

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
