import { describe, expect, it } from 'vitest';
import { buildDashboard } from '@/lib/access/dashboardWidgetRegistry';
import { buildNavigation } from '@/lib/access/navigationRegistry';
import type { PermissionMap } from '@/lib/access/permissionKeys';

const employee: PermissionMap = {
  'dashboard.view': 'own',
  'employees.view': 'organisation',
  'organisation.view': 'organisation',
};

const departmentHead: PermissionMap = {
  ...employee,
  'team.view': 'team',
  'organisation.stats': 'department',
};

describe('buildNavigation', () => {
  it('shows only what the permissions allow', () => {
    const labels = buildNavigation(employee).flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(['Overview', 'Employees', 'Hierarchy']);
  });

  it('drops a section with nothing to show', () => {
    expect(buildNavigation(employee).map((section) => section.title)).toEqual(['Workspace', 'People']);
  });

  it('shows nothing without permissions', () => {
    expect(buildNavigation({})).toEqual([]);
  });

  it('works for a role the code has never heard of', () => {
    const labels = buildNavigation({ 'audit.view': 'own' }).flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(['Audit log']);
  });
});

describe('buildDashboard', () => {
  it('gives an employee a personal dashboard', () => {
    expect(buildDashboard(employee).map((widget) => widget.key)).toEqual(['myProfile']);
  });

  it('adds team and department figures for a head', () => {
    expect(buildDashboard(departmentHead).map((widget) => widget.key)).toEqual([
      'organisationStats',
      'departmentHeadcount',
      'myProfile',
      'myTeam',
    ]);
  });
});
