// Team-only access for department heads, the narrower staff directory, and who has the
// Clients section. Tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { createLogin, createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('team access', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let designDepartment = '';
  let clientId = '';

  async function permissionKeys(key: string) {
    const { data } = await as[key]!.rpc('get_my_permissions');
    return Object.fromEntries((data ?? []).map((row) => [row.permission_key, row.scope]));
  }

  async function directory(key: string) {
    const { data } = await as[key]!.rpc('get_directory_employee_ids');
    return new Set(data ?? []);
  }

  async function addAs(key: string, values: Record<string, unknown>) {
    const email = `added.${Math.random().toString(36).slice(2)}.${runId}@test.local`;
    const authUserId = await createLogin(email);
    return as[key]!
      .from('employees')
      .insert({ auth_user_id: authUserId, full_name: 'New Starter', work_email: email, ...values } as never)
      .select('id, role:roles(name)')
      .single();
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('designHead', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('lead', 'Employee', 'Design & Development', 'designHead');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'lead');
    await people.addPerson('developer', 'Employee', 'Design & Development', 'lead');
    await people.addPerson('outsider', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('marketingHead', 'Digital Marketing Head', 'Digital Marketing', 'founder');
    await people.addPerson('financeHead', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    designDepartment = await people.departmentId('Design & Development');

    const { data } = await admin
      .from('clients')
      .insert({ company_name: `Team access client ${runId}`, client_manager_id: ids.manager!, department_id: designDepartment, status: 'active' })
      .select('id')
      .single();
    clientId = data!.id;
  });

  describe('the staff directory', () => {
    it('shows a department head only their own team', async () => {
      const seen = await directory('designHead');

      expect(['designHead', 'lead', 'designer', 'developer'].every((key) => seen.has(ids[key]!))).toBe(true);
      expect(seen.has(ids.outsider!)).toBe(false);
      expect(seen.has(ids.marketingHead!)).toBe(false);
      expect(seen.has(ids.founder!)).toBe(false);
    });

    it('shows an employee their manager and the colleagues who share that manager', async () => {
      const seen = await directory('designer');

      expect([...seen].sort()).toEqual([ids.designer, ids.developer, ids.lead].sort());
    });

    it('opens a profile only inside that reach', async () => {
      const own = await as.designer!.rpc('can_view_employee_profile', { p_target: ids.developer! });
      const other = await as.designer!.rpc('can_view_employee_profile', { p_target: ids.outsider! });

      expect(own.data).toBe(true);
      expect(other.data).toBe(false);
    });

    it('still shows everyone\'s names, for tasks, chats and meetings', async () => {
      const { data } = await as.designer!.from('employees').select('id, full_name').eq('id', ids.marketingHead!).single();

      expect(data?.full_name).toBe('Test marketingHead');
    });

    it('keeps the whole directory and organisation chart for the Founder alone here', async () => {
      const founder = await directory('founder');

      expect(Object.values(ids).every((id) => founder.has(id))).toBe(true);
      expect((await permissionKeys('designHead'))['organisation.view']).toBeUndefined();
      expect((await permissionKeys('designer'))['organisation.view']).toBeUndefined();
      expect((await permissionKeys('founder'))['organisation.view']).toBe('organisation');
    });
  });

  describe('adding and editing people', () => {
    it('gives department heads team scope', async () => {
      for (const key of ['designHead', 'marketingHead', 'financeHead', 'manager']) {
        const scopes = await permissionKeys(key);
        expect([scopes['employees.view'], scopes['employees.create'], scopes['employees.update']], key).toEqual(['team', 'team', 'team']);
      }
    });

    it('lets a head add someone to their team, always as an Employee', async () => {
      const founderRole = await people.roleId('Founder');
      const { data, error } = await addAs('designHead', {
        role_id: founderRole,
        department_id: designDepartment,
        reporting_manager_id: ids.lead!,
      });

      expect(error).toBeNull();
      expect(data?.role?.name).toBe('Employee');
    });

    it('refuses someone reporting outside the team, or in another department', async () => {
      const employeeRole = await people.roleId('Employee');
      const outsideTeam = await addAs('designHead', { role_id: employeeRole, department_id: designDepartment, reporting_manager_id: ids.outsider! });
      const noManager = await addAs('designHead', { role_id: employeeRole, department_id: designDepartment, reporting_manager_id: null });
      const otherDepartment = await addAs('designHead', {
        role_id: employeeRole,
        department_id: await people.departmentId('Finance'),
        reporting_manager_id: ids.designHead!,
      });

      expect(outsideTeam.error?.code).toBe('42501');
      expect(noManager.error?.code).toBe('42501');
      expect(otherDepartment.error?.code).toBe('42501');
    });

    it('lets a head edit their team, but not move someone out of it', async () => {
      const inTeam = await as.designHead!.from('employees').update({ full_name: 'Test designer' }).eq('id', ids.designer!).select('id');
      const outside = await as.designHead!.from('employees').update({ full_name: 'Renamed' }).eq('id', ids.outsider!).select('id');
      const moveOut = await as.designHead!.from('employees').update({ reporting_manager_id: ids.outsider! }).eq('id', ids.designer!);

      expect(inTeam.data).toHaveLength(1);
      expect(outside.data ?? []).toEqual([]);
      expect(moveOut.error?.message).toContain('within your team');
    });

    it('stops an employee adding anyone', async () => {
      const { error } = await addAs('designer', {
        role_id: await people.roleId('Employee'),
        department_id: designDepartment,
        reporting_manager_id: ids.designer!,
      });

      expect(error?.code).toBe('42501');
    });
  });

  describe('my workload', () => {
    it('gives everyone their own workload, and only their own', async () => {
      const { error } = await as.designHead!.from('tasks').insert({ title: `Workload task ${runId}`, assignee_id: ids.designer!, estimated_hours: 6 });
      expect(error).toBeNull();

      const mine = await as.designer!.rpc('get_my_workload_rows');
      const team = await as.designer!.rpc('get_workload_rows');

      expect(mine.data?.every((row) => row.employee_id === ids.designer)).toBe(true);
      expect(mine.data?.some((row) => row.task_id !== null)).toBe(true);
      expect(team.data ?? []).toEqual([]);
    });

    it('still returns a row for someone with no tasks', async () => {
      const { data } = await as.developer!.rpc('get_my_workload_rows');

      expect(data).toEqual([expect.objectContaining({ employee_id: ids.developer, task_id: null })]);
    });
  });

  describe('the Clients section', () => {
    it('belongs to Client Managers and the Founder only', async () => {
      for (const key of ['designHead', 'marketingHead', 'financeHead', 'designer']) {
        expect((await permissionKeys(key))['clients.view'], key).toBeUndefined();
      }
      expect((await permissionKeys('manager'))['clients.view']).toBe('organisation');
    });

    it('hides client records from department heads', async () => {
      const { data } = await as.designHead!.from('clients').select('id').eq('id', clientId);

      expect(data).toEqual([]);
    });

    it('still lets finance see who they bill, but not Client 360', async () => {
      const { data } = await as.financeHead!.from('clients').select('company_name, billing_state').eq('id', clientId).single();
      const timeline = await as.financeHead!.rpc('get_client_timeline', { p_client: clientId });
      const canView = await as.financeHead!.rpc('can_view_client', { p_client: clientId });

      expect(data?.company_name).toBe(`Team access client ${runId}`);
      expect(timeline.data).toEqual([]);
      expect(canView.data).toBe(false);
    });

    it('still shows a head the client name on their work', async () => {
      const { data } = await as.designHead!.rpc('get_client_labels', { p_clients: [clientId] });

      expect(data?.[0]?.company_name).toBe(`Team access client ${runId}`);
    });
  });
});
