// HR manages everyone except people whose role keeps records private (Founder and
// Co-Founder), and people whose role does not record attendance (the Founder) are left
// out of attendance.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople, signIn } from './helpers/testDatabase';

const runId = Date.now();

describe('HR access and private records', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as, roleId } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('coFounder', 'Co-Founder', 'Management', 'founder');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('manager', 'Client Manager', 'Client Services', 'founder');
    await people.addPerson('financeHead', 'Finance Head', 'Management', 'founder');
    await people.addPerson('employee', 'Employee', 'Design & Development', 'manager');
  });

  describe('HR manages everyone else', () => {
    it('edits a Client Manager, whose access HR does not hold', async () => {
      const { data, error } = await as.hr!
        .from('employees')
        .update({ full_name: 'Priya Manager', phone: '9876543210', skills: ['Sales'] })
        .eq('id', ids.manager!)
        .select('full_name, skills');
      expect(error).toBeNull();
      expect(data).toEqual([{ full_name: 'Priya Manager', skills: ['Sales'] }]);
    });

    it('changes roles, except to a role with private records', async () => {
      const toEmployee = await as.hr!.from('employees').update({ role_id: await roleId('Employee') }).eq('id', ids.financeHead!).select('id');
      expect(toEmployee.error).toBeNull();
      expect(toEmployee.data).toHaveLength(1);

      const toCoFounder = await as.hr!.from('employees').update({ role_id: await roleId('Co-Founder') }).eq('id', ids.employee!).select('id');
      expect(toCoFounder.error?.message).toContain('permission to assign this role');
    });

    it('lists every role but the private ones for HR to assign', async () => {
      const { data } = await as.hr!.rpc('get_assignable_role_ids');
      const names = ((await admin.from('roles').select('id, name')).data ?? []).filter((role) => (data as string[]).includes(role.id)).map((role) => role.name);
      expect(names).toEqual(expect.arrayContaining(['Client Manager', 'Finance Head', 'Employee', 'Human Resource']));
      expect(names).not.toContain('Founder');
      expect(names).not.toContain('Co-Founder');
    });

    it('deactivates and reactivates a Client Manager', async () => {
      const off = await as.hr!.from('employees').update({ is_active: false }).eq('id', ids.manager!).select('id');
      expect(off.data).toHaveLength(1);
      await as.hr!.from('employees').update({ is_active: true }).eq('id', ids.manager!).select('id');
    });

    it('cannot give themselves more access through an additional role', async () => {
      const { error } = await as.hr!.rpc('set_employee_extra_roles', { p_employee: ids.hr!, p_roles: [await roleId('Finance Head')] });
      expect(error?.message).toContain('permission to assign this role');
    });

    it('can give someone else an additional role', async () => {
      const { error } = await as.hr!.rpc('set_employee_extra_roles', { p_employee: ids.employee!, p_roles: [await roleId('Client Manager')] });
      expect(error).toBeNull();
    });
  });

  describe('login email', () => {
    it('lets HR change it, and the person signs in with the new one', async () => {
      const email = `priya.new.${runId}@test.local`;
      const { error } = await as.hr!.rpc('change_employee_login_email', { p_employee: ids.manager!, p_email: ` ${email.toUpperCase()} ` });
      expect(error).toBeNull();
      expect((await admin.from('employees').select('work_email').eq('id', ids.manager!).single()).data!.work_email).toBe(email);

      const client = await signIn(email);
      const { data } = await client.rpc('get_my_permissions');
      expect(data).not.toBeNull();
      await expect(signIn(`manager.${runId}@test.local`)).rejects.toBeTruthy();
    });

    it('refuses an email someone already uses, and nobody else may change it directly', async () => {
      const taken = await as.hr!.rpc('change_employee_login_email', { p_employee: ids.employee!, p_email: `hr.${runId}@test.local` });
      expect(taken.error?.code).toBe('23505');

      const direct = await as.hr!.from('employees').update({ work_email: `x.${runId}@test.local` }).eq('id', ids.employee!).select('id');
      expect(direct.error?.message).toContain('cannot be changed here');

      const byEmployee = await as.employee!.rpc('change_employee_login_email', { p_employee: ids.hr!, p_email: `y.${runId}@test.local` });
      expect(byEmployee.error?.code).toBe('42501');
    });
  });

  describe('Founder and Co-Founder records', () => {
    it('are hidden from HR, but not from each other', async () => {
      const hiddenFromHr = (await as.hr!.rpc('get_hidden_employee_ids')).data as string[];
      const hiddenFromCoFounder = (await as.coFounder!.rpc('get_hidden_employee_ids')).data as string[];
      expect(hiddenFromHr).toEqual(expect.arrayContaining([ids.founder!, ids.coFounder!]));
      expect(hiddenFromHr).not.toContain(ids.manager!);
      expect(hiddenFromCoFounder).toEqual([]);
    });

    it('cannot be edited, deactivated or renamed by HR', async () => {
      const rename = await as.hr!.from('employees').update({ full_name: 'Changed' }).eq('id', ids.coFounder!).select('id');
      const deactivate = await as.hr!.from('employees').update({ is_active: false }).eq('id', ids.founder!).select('id');
      const email = await as.hr!.rpc('change_employee_login_email', { p_employee: ids.coFounder!, p_email: `cf.${runId}@test.local` });
      expect(rename.error?.code ?? (rename.data?.length === 0 ? 'none' : null)).not.toBeNull();
      expect(deactivate.error?.code ?? (deactivate.data?.length === 0 ? 'none' : null)).not.toBeNull();
      expect(email.error?.code).toBe('42501');
      expect((await admin.from('employees').select('full_name, is_active').eq('id', ids.coFounder!).single()).data).toEqual({ full_name: 'Test coFounder', is_active: true });
    });

    it('keeps their personal, ID and bank details from HR', async () => {
      await admin.from('employee_personal_details').upsert({ employee_id: ids.founder!, address: 'Founder home' });
      await admin.from('employee_private_details').upsert({ employee_id: ids.founder!, pan: 'ABCDE1234F' });

      expect((await as.hr!.rpc('can_see_personal_details', { p_employee: ids.founder! })).data).toBe(false);
      expect((await as.hr!.from('employee_personal_details').select('address').eq('employee_id', ids.founder!)).data).toEqual([]);
      expect((await as.hr!.from('employee_private_details').select('pan').eq('employee_id', ids.founder!)).data).toEqual([]);
      expect((await as.hr!.rpc('record_private_detail_reveal', { p_employee: ids.founder!, p_field: 'aadhaar' })).error?.code).toBe('42501');
      const write = await as.hr!.from('employee_private_details').update({ pan: 'ZZZZZ9999Z' }).eq('employee_id', ids.founder!).select('pan');
      expect(write.data ?? []).toEqual([]);

      // HR still sees everyone else's.
      await admin.from('employee_private_details').upsert({ employee_id: ids.employee!, pan: 'BCDEF2345G' });
      expect((await as.hr!.from('employee_private_details').select('pan').eq('employee_id', ids.employee!)).data).toEqual([{ pan: 'BCDEF2345G' }]);
    });
  });

  describe('attendance', () => {
    it('is not recorded for the Founder', async () => {
      const { error } = await as.founder!.rpc('attendance_check_in');
      expect(error?.message).toContain('does not record attendance');
      expect((await as.employee!.rpc('attendance_check_in')).error).toBeNull();
    });

    it('leaves the Founder out of the report, and the Co-Founder out of HR\'s', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const forHr = (await as.hr!.rpc('get_attendance_report_data', { p_from: today, p_to: today })).data as { employees: { id: string }[] };
      const forFounder = (await as.founder!.rpc('get_attendance_report_data', { p_from: today, p_to: today })).data as { employees: { id: string }[] };
      const hrIds = forHr.employees.map((person) => person.id);
      const founderIds = forFounder.employees.map((person) => person.id);

      expect(hrIds).toContain(ids.employee!);
      expect(hrIds).not.toContain(ids.founder!);
      expect(hrIds).not.toContain(ids.coFounder!);
      expect(founderIds).toContain(ids.coFounder!);
      expect(founderIds).not.toContain(ids.founder!);
    });

    it('cannot be corrected by HR for the Co-Founder', async () => {
      const { error } = await as.hr!.rpc('correct_attendance_bulk', {
        p_employees: [ids.coFounder!],
        p_from: '2027-03-01',
        p_to: '2027-03-01',
        p_status: 'present',
        p_note: 'Test',
      });
      expect(error?.code).toBe('42501');
    });
  });
});
