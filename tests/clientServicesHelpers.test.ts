import { describe, expect, it } from 'vitest';
import { buildDashboard } from '@/lib/access/dashboardWidgetRegistry';
import { checkServiceSelection, listInWords } from '@/lib/clients/serviceSelection';

const names = { web: 'Web & AI', marketing: 'Marketing & Visibility', design: 'Brand & Design' };

describe('checkServiceSelection', () => {
  it('accepts a sub service for every chosen service', () => {
    expect(
      checkServiceSelection(['web', 'marketing'], [{ id: 'site', serviceId: 'web' }, { id: 'seo', serviceId: 'marketing' }], names),
    ).toBeNull();
  });

  it('needs at least one service', () => {
    expect(checkServiceSelection([], [], names)).toEqual({ field: 'serviceGroupIds', message: 'Choose at least one service.' });
  });

  it('names every service still missing a sub service', () => {
    expect(checkServiceSelection(['web', 'marketing', 'design'], [{ id: 'site', serviceId: 'web' }], names)).toEqual({
      field: 'serviceIds',
      message: 'Choose at least one sub service for Marketing & Visibility and Brand & Design.',
    });
  });

  it('refuses a sub service from a service that was not chosen', () => {
    expect(checkServiceSelection(['web'], [{ id: 'site', serviceId: 'web' }, { id: 'seo', serviceId: 'marketing' }], names)).toEqual({
      field: 'serviceIds',
      message: 'Choose sub services only from the services you chose.',
    });
  });

  it('lists names in plain words', () => {
    expect(listInWords(['A'])).toBe('A');
    expect(listInWords(['A', 'B'])).toBe('A and B');
    expect(listInWords(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('my workload on the dashboard', () => {
  it('appears for everyone who has tasks', () => {
    const keys = buildDashboard({ 'dashboard.view': 'own', 'tasks.view': 'own' }).map((widget) => widget.key);

    expect(keys).toContain('myWorkload');
  });
});
