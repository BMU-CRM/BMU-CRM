// Showing a full Aadhaar, PAN or account number asks for the viewer's own password, and
// PAN is now a recorded reveal like the other two.
import { describe, expect, it } from 'vitest';
import { confirmOwnPassword, createAuthUser } from '@/server/auth/authAccounts';
import { hasTooManyFailures, recordFailure } from '@/server/auth/signInRateLimit';
import { createLogin, createTestPeople, testDatabase, testPassword } from './helpers/testDatabase';

const runId = Date.now();

describe('the password asked before a number is shown', () => {
  it('accepts only the signed-in person\'s own password', async () => {
    const db = await testDatabase();
    const userId = await createLogin(`reveal.${runId}@test.local`);
    expect(await confirmOwnPassword(db, userId, testPassword)).toBe('ok');
    expect(await confirmOwnPassword(db, userId, 'not-the-password')).toBe('invalid');
    expect(await confirmOwnPassword(db, '00000000-0000-0000-0000-000000000000', testPassword)).toBe('invalid');
  });

  it('says so when the login only uses Google', async () => {
    const db = await testDatabase();
    const userId = await createAuthUser(db, { email: `google.${runId}@test.local` });
    expect(await confirmOwnPassword(db, userId, 'anything')).toBe('no-password');
  });

  it('stops after ten wrong passwords, and does not count right ones', async () => {
    const db = await testDatabase();
    const key = `reveal:${runId}`;
    for (let attempt = 0; attempt < 9; attempt += 1) await recordFailure(db, key);
    expect(await hasTooManyFailures(db, key)).toBe(false);
    await recordFailure(db, key);
    expect(await hasTooManyFailures(db, key)).toBe(true);
  });
});

describe('PAN reveals', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  it('are recorded for HR and the person, and refused to others', async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'head');

    expect((await as.hr!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'pan' })).error).toBeNull();
    expect((await as.designer!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'pan' })).error).toBeNull();
    expect((await as.head!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'pan' })).error?.code).toBe('42501');
    expect((await as.hr!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'ifsc' })).error).not.toBeNull();

    const { data } = await admin
      .from('audit_logs')
      .select('actor_employee_id')
      .eq('action', 'revealed')
      .eq('entity_id', ids.designer!);
    expect((data ?? []).map((row) => row.actor_employee_id).sort()).toEqual([ids.designer!, ids.hr!].sort());
  });
});
