// Runs against a real database as real signed-in users, because this is what proves
// the rules hold when someone bypasses the app and queries the database directly.
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonymousClient, createLogin, signIn, type Client } from './helpers/testDatabase';

const runId = Date.now();

describe('database access rules', () => {
  const admin = adminClient();
  const ids: Record<string, string> = {};
  const clients: Record<string, Client> = {};
  let extraRoleId = '';

  async function roleId(name: string) {
    const { data } = await admin.from('roles').select('id').eq('name', name).single();
    return data!.id;
  }

  async function departmentId(name: string) {
    const { data } = await admin.from('departments').select('id').eq('name', name).single();
    return data!.id;
  }

  async function addPerson(key: string, role: string, department: string, managerKey?: string) {
    const email = `${key}.${runId}@test.local`;
    const authUserId = await createLogin(email);

    const { data: row, error: rowError } = await admin
      .from('employees')
      .insert({
        auth_user_id: authUserId,
        full_name: `Test ${key}`,
        work_email: email,
        role_id: await roleId(role),
        department_id: await departmentId(department),
        reporting_manager_id: managerKey ? ids[managerKey] : null,
      })
      .select('id')
      .single();
    if (rowError) throw rowError;
    ids[key] = row.id;
    clients[key] = await signIn(email);
  }

  beforeAll(async () => {
    await addPerson('founder', 'Founder', 'Management');
    await addPerson('cofounder', 'Co-Founder', 'Management', 'founder');
    await addPerson('devhead', 'Design & Development Head', 'Design & Development', 'founder');
    await addPerson('dev', 'Employee', 'Design & Development', 'devhead');
    await addPerson('marketer', 'Employee', 'Digital Marketing', 'founder');
  });

  it('blocks anonymous visitors from every table', async () => {
    const anonymous = anonymousClient();
    const { error } = await anonymous.from('employees').select('id');

    expect(error?.code).toBe('42501');
  });

  it('blocks anonymous calls to access functions', async () => {
    const anonymous = anonymousClient();
    const { error } = await anonymous.rpc('get_my_permissions');

    expect(error).not.toBeNull();
  });

  it('gives each role its own permissions', async () => {
    const { data } = await clients.dev!.rpc('get_my_permissions');

    expect(data?.map((row) => row.permission_key).sort()).toEqual([
      'attendance.view',
      'dashboard.view',
      'files.upload',
      'files.view',
      'leave.request',
      'meetings.create',
      'messages.use',
      'payslips.view',
      'projects.view',
      'reimbursements.submit',
      'resignation.submit',
      'tasks.create',
      'tasks.view',
      'tickets.create',
    ]);
  });

  it('stops an employee changing their own role', async () => {
    const { error } = await clients.dev!
      .from('employees')
      .update({ role_id: await roleId('Founder') })
      .eq('id', ids.dev!);

    expect(error?.message).toContain('cannot change your own role');
  });

  it('stops an employee changing their own designation or manager', async () => {
    const { error } = await clients.dev!
      .from('employees')
      .update({ reporting_manager_id: ids.founder! })
      .eq('id', ids.dev!);

    expect(error?.code).toBe('42501');
  });

  it('lets an employee update their own phone and skills', async () => {
    const { error } = await clients.dev!
      .from('employees')
      .update({ phone: '+91 98765 43210', skills: ['Figma'] })
      .eq('id', ids.dev!);

    expect(error).toBeNull();
  });

  it('stops an employee editing a colleague', async () => {
    const { data, error } = await clients.dev!
      .from('employees')
      .update({ phone: '+91 90000 00000' })
      .eq('id', ids.marketer!)
      .select('id');

    expect(error === null ? data : []).toEqual([]);
  });

  it('lets a head edit someone in their department', async () => {
    const { error } = await clients.devhead!
      .from('employees')
      .update({ full_name: 'Test dev renamed' })
      .eq('id', ids.dev!);

    expect(error).toBeNull();
  });

  it('stops a head editing someone in another department', async () => {
    const { data, error } = await clients.devhead!
      .from('employees')
      .update({ full_name: 'Should not change' })
      .eq('id', ids.marketer!)
      .select('id');

    expect(error === null ? data : []).toEqual([]);
  });

  it('stops a head transferring an employee to another department', async () => {
    const { error } = await clients.devhead!
      .from('employees')
      .update({ department_id: await departmentId('Finance') })
      .eq('id', ids.dev!);

    expect(error?.message).toContain('organisation-wide access');
  });

  it('stops a head changing their own manager', async () => {
    const { error } = await clients.devhead!
      .from('employees')
      .update({ reporting_manager_id: ids.cofounder! })
      .eq('id', ids.devhead!);

    expect(error?.code).toBe('42501');
  });

  it('stops a co-founder assigning the Founder role', async () => {
    const { error } = await clients.cofounder!
      .from('employees')
      .update({ role_id: await roleId('Founder') })
      .eq('id', ids.dev!);

    expect(error?.message).toContain('permission to assign this role');
  });

  it('stops a co-founder deactivating the Founder', async () => {
    const { error } = await clients.cofounder!.from('employees').update({ is_active: false }).eq('id', ids.founder!);

    expect(error?.code).toBe('42501');
  });

  it('stops a co-founder editing the Founder', async () => {
    const { error } = await clients.cofounder!
      .from('employees')
      .update({ full_name: 'Changed' })
      .eq('id', ids.founder!);

    expect(error?.code).toBe('42501');
  });

  it('stops an employee creating another employee', async () => {
    const { error } = await clients.dev!.from('employees').insert({
      full_name: 'Intruder',
      work_email: `intruder.${runId}@test.local`,
      role_id: await roleId('Founder'),
    });

    expect(error?.code).toBe('42501');
  });

  it('stops anyone deleting an employee record', async () => {
    const { error } = await clients.founder!.from('employees').delete().eq('id', ids.marketer!);

    expect(error?.code).toBe('42501');
  });

  it('stops anyone deactivating themselves', async () => {
    const { error } = await clients.founder!.from('employees').update({ is_active: false }).eq('id', ids.founder!);

    expect(error?.message).toContain('your own account status');
  });

  it('rejects a reporting loop', async () => {
    const { error } = await clients.founder!
      .from('employees')
      .update({ reporting_manager_id: ids.dev! })
      .eq('id', ids.devhead!);

    expect(error?.message).toContain('reporting loop');
  });

  it('rejects a department loop', async () => {
    const { data: parent } = await admin.from('departments').insert({ name: `Test Dept ${runId} A` }).select('id').single();
    const { data: child } = await admin
      .from('departments')
      .insert({ name: `Test Dept ${runId} B`, parent_department_id: parent!.id })
      .select('id')
      .single();

    const { error } = await clients.founder!
      .from('departments')
      .update({ parent_department_id: child!.id })
      .eq('id', parent!.id);

    await admin.from('departments').update({ parent_department_id: null }).eq('id', child!.id);

    expect(error?.message).toContain('create a loop');
  });

  it('stops an employee managing departments', async () => {
    const { error } = await clients.dev!.from('departments').insert({ name: `Test Dept ${runId} X` });

    expect(error?.code).toBe('42501');
  });

  it('protects the Founder role from everyone, including the Founder', async () => {
    const founderRole = await roleId('Founder');
    const { error } = await clients.founder!.rpc('set_role_permissions', { p_role: founderRole, p_permissions: [] });
    const { count } = await admin
      .from('role_permissions')
      .select('role_id', { count: 'exact', head: true })
      .eq('role_id', founderRole);

    expect(count).toBeGreaterThan(0);
    expect(error === null || error.code === '42501').toBe(true);
  });

  it('stops an employee granting themselves permissions', async () => {
    const { error } = await clients.dev!.rpc('set_role_permissions', {
      p_role: await roleId('Employee'),
      p_permissions: [{ key: 'roles.manage', scope: 'organisation' }],
    });

    expect(error?.code).toBe('42501');
  });

  it('lets the Founder create a role and applies it straight away', async () => {
    const { data, error } = await clients.founder!
      .from('roles')
      .insert({ name: `Test Role ${runId}` })
      .select('id')
      .single();
    expect(error).toBeNull();
    extraRoleId = data!.id;

    const { error: permissionError } = await clients.founder!.rpc('set_role_permissions', {
      p_role: extraRoleId,
      p_permissions: [
        { key: 'dashboard.view', scope: 'own' },
        { key: 'employees.view', scope: 'department' },
      ],
    });
    expect(permissionError).toBeNull();

    await clients.founder!.from('employees').update({ role_id: extraRoleId }).eq('id', ids.marketer!);

    // The staff directory follows the role's scope. Names stay readable for daily work.
    const { data: directory } = await clients.marketer!.rpc('get_directory_employee_ids');
    const { data: names } = await clients.marketer!.from('employees').select('id');
    expect(directory).toEqual([ids.marketer]);
    expect(names!.length).toBeGreaterThan(1);

    await clients.founder!.from('employees').update({ role_id: await roleId('Employee') }).eq('id', ids.marketer!);
  });

  it('rejects a scope a permission does not allow', async () => {
    const { error } = await clients.founder!.rpc('set_role_permissions', {
      p_role: extraRoleId,
      p_permissions: [{ key: 'dashboard.view', scope: 'organisation' }],
    });

    expect(error?.message).toContain('scope is not available');
  });

  it('removes all data access when an account is deactivated', async () => {
    const { error } = await clients.founder!.from('employees').update({ is_active: false }).eq('id', ids.marketer!);
    expect(error).toBeNull();

    const { data } = await clients.marketer!.from('employees').select('id');
    const { data: departments } = await clients.marketer!.from('departments').select('id');
    expect(data).toEqual([]);
    expect(departments).toEqual([]);

    await clients.founder!.from('employees').update({ is_active: true }).eq('id', ids.marketer!);
  });

  it('records changes with the person who made them', async () => {
    await clients.founder!.from('employees').update({ phone: '+91 91111 11111' }).eq('id', ids.marketer!);

    const { data } = await clients.founder!
      .from('audit_logs')
      .select('actor_employee_id, action, entity_type, entity_id, details')
      .eq('entity_id', ids.marketer!)
      .order('id', { ascending: false })
      .limit(1)
      .single();

    expect(data).toMatchObject({
      actor_employee_id: ids.founder,
      action: 'updated',
      entity_type: 'employees',
    });
    expect(data?.details).toHaveProperty('changes.phone');
  });

  it('hides the audit log from employees', async () => {
    const { data } = await clients.dev!.from('audit_logs').select('id').limit(1);

    expect(data ?? []).toEqual([]);
  });

  it('stops anyone changing the audit log, even the service role', async () => {
    const { data: entry } = await admin.from('audit_logs').select('id').limit(1).single();

    const founderAttempt = await clients.founder!.from('audit_logs').delete().eq('id', entry!.id);
    const adminAttempt = await admin.from('audit_logs').update({ action: 'tampered' }).eq('id', entry!.id);
    const adminDelete = await admin.from('audit_logs').delete().eq('id', entry!.id);

    expect(founderAttempt.error?.code).toBe('42501');
    expect(adminAttempt.error?.message).toContain('cannot be changed');
    expect(adminDelete.error?.message).toContain('cannot be changed');
  });
});
