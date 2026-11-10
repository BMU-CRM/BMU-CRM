import { describe, expect, it } from 'vitest';
import { databaseFailure, validationFailure } from '@/lib/actionResult';
import { describeAuditEntry } from '@/lib/audit/describeAuditEntry';
import { buildOrganisationTree } from '@/lib/organisation/buildOrganisationTree';
import { setPasswordSchema } from '@/lib/validation/authSchema';
import { updateMyProfileSchema } from '@/lib/validation/employeeSchema';

describe('buildOrganisationTree', () => {
  it('nests people under their managers', () => {
    const roots = buildOrganisationTree([
      { id: 'founder', reportingManagerId: null },
      { id: 'head', reportingManagerId: 'founder' },
      { id: 'member', reportingManagerId: 'head' },
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.reports[0]?.reports[0]?.person.id).toBe('member');
  });

  it('keeps people visible when their manager is not listed', () => {
    const roots = buildOrganisationTree([{ id: 'member', reportingManagerId: 'deactivated' }]);

    expect(roots.map((node) => node.person.id)).toEqual(['member']);
  });
});

describe('describeAuditEntry', () => {
  it('names the fields that changed', () => {
    const summary = describeAuditEntry({
      action: 'updated',
      entity_type: 'employees',
      details: { label: 'Ravi Member', changes: { role_id: {}, is_active: {} } },
    });

    expect(summary).toBe('Updated employee Ravi Member: role, account status');
  });

  it('names what was created', () => {
    const summary = describeAuditEntry({
      action: 'created',
      entity_type: 'departments',
      details: { label: 'Sales', created: { name: 'Sales' } },
    });

    expect(summary).toBe('Created department Sales');
  });
});

describe('databaseFailure', () => {
  it('hides raw row level security messages', () => {
    const result = databaseFailure({ code: '42501', message: 'new row violates row-level security policy' });

    expect(result.message).toBe('You do not have permission to do this.');
  });

  it('passes through messages written by our database rules', () => {
    const result = databaseFailure({ code: '42501', message: 'You cannot change your own role.' });

    expect(result.message).toBe('You cannot change your own role.');
  });
});

describe('validation', () => {
  it('rejects a short password', () => {
    const parsed = setPasswordSchema.safeParse({ password: 'short1', confirmPassword: 'short1' });

    expect(parsed.success).toBe(false);
  });

  it('reports mismatched passwords on the confirm field', () => {
    const parsed = setPasswordSchema.safeParse({ password: 'longenough123', confirmPassword: 'different123' });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(validationFailure(parsed.error).fieldErrors?.confirmPassword).toBe('The passwords do not match.');
    }
  });

  it('splits skills on commas and drops blanks', () => {
    const parsed = updateMyProfileSchema.parse({ phone: '', skills: 'SEO, , Figma ' });

    expect(parsed).toEqual({ phone: null, skills: ['SEO', 'Figma'] });
  });
});
