// Stage 1 of HR and Finance: who gets the dashboards, leave approved by HR only, one
// person switching between two roles, the sidebar sections, and chart scaling.
import { beforeAll, describe, expect, it } from 'vitest';
import { axisMaximum, niceMaximum } from '@/components/charts/ChartFrame';
import { buildNavigation } from '@/lib/access/navigationRegistry';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('HR and finance foundation', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  async function permissions(key: string) {
    const { data } = await as[key]!.rpc('get_my_permissions');
    return Object.fromEntries((data ?? []).map((row) => [row.permission_key, row.scope]));
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'head');
  });

  describe('who gets the dashboards', () => {
    it('gives HR the HR dashboard and leave approval across the company', async () => {
      const hr = await permissions('hr');
      expect(hr['hr.dashboard']).toBe('organisation');
      expect(hr['leave.approve']).toBe('organisation');
      expect(hr['finance.dashboard']).toBeUndefined();
    });

    it('gives Finance Head the finance dashboard, and the Founder both', async () => {
      expect((await permissions('finance'))['finance.dashboard']).toBe('organisation');
      const founder = await permissions('founder');
      expect(founder['hr.dashboard']).toBe('organisation');
      expect(founder['finance.dashboard']).toBe('organisation');
    });

    it('keeps both dashboards and leave approval from heads and team members', async () => {
      for (const key of ['head', 'designer']) {
        const scopes = await permissions(key);
        expect([scopes['hr.dashboard'], scopes['finance.dashboard'], scopes['leave.approve']], key).toEqual([undefined, undefined, undefined]);
      }
    });

    it('gives the HR figures to HR only', async () => {
      const { data, error } = await as.hr!.rpc('get_hr_dashboard', { p_from: '2026-01-01', p_to: '2026-12-31' });
      expect(error).toBeNull();
      const figures = data as { active: number; departments: { name: string; count: number }[] };
      expect(figures.active).toBeGreaterThanOrEqual(5);
      expect(figures.departments.some((department) => department.name === 'Design & Development')).toBe(true);

      for (const key of ['head', 'designer', 'finance']) {
        expect((await as[key]!.rpc('get_hr_dashboard', { p_from: '2026-01-01', p_to: '2026-12-31' })).error?.message, key).toContain(
          'permission',
        );
      }
    });
  });

  describe('one person, two roles', () => {
    let hrRole = '';
    let financeRole = '';

    beforeAll(async () => {
      hrRole = (await admin.from('roles').select('id').eq('name', 'Human Resource').single()).data!.id;
      financeRole = (await admin.from('roles').select('id').eq('name', 'Finance Head').single()).data!.id;
    });

    it('lets only someone who assigns roles give a second role', async () => {
      const refused = await as.head!.rpc('set_employee_extra_roles', { p_employee: ids.finance!, p_roles: [hrRole] });
      expect(refused.error?.message).toContain('permission');

      const given = await as.founder!.rpc('set_employee_extra_roles', { p_employee: ids.finance!, p_roles: [hrRole] });
      expect(given.error).toBeNull();
      const { data: roles } = await as.finance!.rpc('get_my_roles');
      expect((roles ?? []).map((role) => role.name).sort()).toEqual(['Finance Head', 'Human Resource']);
      expect((roles ?? []).find((role) => role.is_current)?.name).toBe('Finance Head');
    });

    it('switches access with the role: HR work as HR, finance work as Finance Head', async () => {
      expect((await permissions('finance'))['hr.dashboard']).toBeUndefined();

      expect((await as.finance!.rpc('switch_my_role', { p_role: hrRole })).error).toBeNull();
      const asHr = await permissions('finance');
      expect(asHr['hr.dashboard']).toBe('organisation');
      expect(asHr['finance.dashboard']).toBeUndefined();
      expect((await as.finance!.rpc('get_hr_dashboard', { p_from: '2026-01-01', p_to: '2026-12-31' })).error).toBeNull();

      expect((await as.finance!.rpc('switch_my_role', { p_role: financeRole })).error).toBeNull();
      expect((await permissions('finance'))['finance.dashboard']).toBe('organisation');
    });

    it('refuses a role the person does not have, and records every switch', async () => {
      const founderRole = (await admin.from('roles').select('id').eq('name', 'Founder').single()).data!.id;
      expect((await as.finance!.rpc('switch_my_role', { p_role: founderRole })).error?.message).toContain('do not have that role');

      const { data: entries } = await admin
        .from('audit_logs')
        .select('details')
        .eq('entity_type', 'employees')
        .eq('entity_id', ids.finance!);
      expect((entries ?? []).some((entry) => JSON.stringify(entry.details).includes('acting_role_id'))).toBe(true);
    });

    it('puts someone back on their main role when the second role is taken away', async () => {
      await as.finance!.rpc('switch_my_role', { p_role: hrRole });
      await as.founder!.rpc('set_employee_extra_roles', { p_employee: ids.finance!, p_roles: [] });
      const scopes = await permissions('finance');
      expect(scopes['hr.dashboard']).toBeUndefined();
      expect(scopes['finance.dashboard']).toBe('organisation');
    });
  });

  describe('the sidebar', () => {
    it('groups HR pages under HR once, and keeps them in their usual places for others', () => {
      const hr = buildNavigation({
        'hr.dashboard': 'organisation',
        'employees.view': 'organisation',
        'attendance.view': 'organisation',
        'leave.approve': 'organisation',
        'leave.request': 'own',
      });
      const hrSection = hr.find((section) => section.title === 'HR');
      expect(hrSection?.items.map((item) => item.label)).toEqual(['HR dashboard', 'Employees', 'Attendance', 'Leave requests']);
      // Approvals, which also holds work to review, stays in Team.
      expect(hr.find((section) => section.title === 'Team')?.items.map((item) => item.href)).toContain('/approvals');
      const hrefs = hr.flatMap((section) => section.items.map((item) => item.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);

      const head = buildNavigation({ 'employees.view': 'team', 'attendance.view': 'own', 'leave.request': 'own' });
      expect(head.some((section) => section.title === 'HR')).toBe(false);
      expect(head.find((section) => section.title === 'People')?.items.map((item) => item.label)).toContain('Employees');
    });

    it('shows the finance dashboard only with its permission', () => {
      const finance = buildNavigation({ 'finance.dashboard': 'organisation', 'finance.reports': 'organisation' });
      expect(finance.find((section) => section.title === 'Finance')?.items.map((item) => item.href)).toEqual(['/finance', '/finance/reports']);
      expect(buildNavigation({ 'invoices.view': 'own' }).flatMap((section) => section.items.map((item) => item.href))).not.toContain('/finance');
    });
  });

  describe('chart scaling', () => {
    it('rounds the axis to a clean number at or above the highest value', () => {
      expect(niceMaximum(0)).toBe(1);
      expect(niceMaximum(7)).toBe(10);
      expect(niceMaximum(12)).toBe(20);
      expect(niceMaximum(240)).toBe(250);
      expect(niceMaximum(84_000)).toBe(100_000);
      expect(niceMaximum(1_000)).toBe(1_000);
    });

    it('keeps axes for counts in whole numbers', () => {
      expect(axisMaximum([0, 0])).toBe(2);
      expect(axisMaximum([1])).toBe(2);
      expect(axisMaximum([0.5])).toBe(0.5);
      expect(axisMaximum([7, 3])).toBe(10);
    });
  });
});
