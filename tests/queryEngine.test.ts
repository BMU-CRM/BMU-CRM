// The local query engine, checked against the starting data the migrations create.
import { beforeAll, describe, expect, it } from 'vitest';
import { isStillInUse } from '@/lib/actionResult';
import { adminClient, anonymousClient, createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('query engine', () => {
  const admin = adminClient();
  const people = createTestPeople(runId);

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('dev', 'Employee', 'Design & Development', 'founder');
  });

  it('selects columns, renames them and orders the rows', async () => {
    const { data, error } = await admin.from('leave_types').select('label:name, yearly_allowance').order('name', { ascending: false });

    expect(error).toBeNull();
    expect(data?.map((row) => row.label)).toEqual(['Unpaid Leave', 'Sick Leave', 'Earned Leave', 'Casual Leave']);
  });

  it('joins the parent record and counts linked rows', async () => {
    const { data } = await admin
      .from('roles')
      .select('name, role_permissions(count)')
      .eq('name', 'Founder')
      .single();
    const { data: person } = await admin
      .from('employees')
      .select('full_name, role:roles(name), department:departments!employees_department_id_fkey(name)')
      .eq('id', people.ids.dev!)
      .single();

    expect((data?.role_permissions as unknown as { count: number }[])[0]?.count).toBeGreaterThan(30);
    expect(person).toEqual({ full_name: 'Test dev', role: { name: 'Employee' }, department: { name: 'Design & Development' } });
  });

  it('joins a parent record named by its linking column', async () => {
    const { data } = await admin
      .from('employees')
      .select('full_name, manager:reporting_manager_id(full_name)')
      .eq('id', people.ids.dev!)
      .single();

    expect(data).toEqual({ full_name: 'Test dev', manager: { full_name: 'Test founder' } });
  });

  it('nests linked lists, and filters them', async () => {
    const { data } = await admin
      .from('roles')
      .select('name, role_permissions(permission_key, scope)')
      .eq('name', 'Employee')
      .eq('role_permissions.permission_key', 'tasks.view')
      .single();

    expect(data?.role_permissions).toEqual([{ permission_key: 'tasks.view', scope: 'own' }]);
  });

  it('keeps only parents with a matching child when joined with !inner', async () => {
    const { data } = await admin
      .from('role_permissions')
      .select('permission_key, role:roles!inner(name)')
      .eq('role.name', 'Employee')
      .eq('permission_key', 'tasks.view');

    expect(data).toEqual([{ permission_key: 'tasks.view', role: { name: 'Employee' } }]);
  });

  it('understands or, in, not, is and ilike', async () => {
    const { data: either } = await admin
      .from('leave_types')
      .select('name')
      .or('name.ilike.%sick%,yearly_allowance.is.null')
      .order('name');
    const { data: listed } = await admin.from('leave_types').select('name').in('name', ['Casual Leave', 'Earned Leave']).order('name');
    const { data: excluded } = await admin.from('leave_types').select('name').not('name', 'in', '("Casual Leave","Earned Leave")').order('name');
    const { data: none } = await admin.from('leave_types').select('name').in('name', []);

    expect(either?.map((row) => row.name)).toEqual(['Sick Leave', 'Unpaid Leave']);
    expect(listed?.map((row) => row.name)).toEqual(['Casual Leave', 'Earned Leave']);
    expect(excluded?.map((row) => row.name)).toEqual(['Sick Leave', 'Unpaid Leave']);
    expect(none).toEqual([]);
  });

  it('pages results and reports the total', async () => {
    const { data, count } = await admin.from('leave_types').select('name', { count: 'exact' }).order('name').range(1, 2);
    const { count: headCount, data: headData } = await admin.from('leave_types').select('id', { count: 'exact', head: true });

    expect(data?.map((row) => row.name)).toEqual(['Earned Leave', 'Sick Leave']);
    expect(count).toBe(4);
    expect(headCount).toBe(4);
    expect(headData).toBeNull();
  });

  it('returns one row for single, and an error when there is not exactly one', async () => {
    const one = await admin.from('leave_types').select('name').eq('name', 'Sick Leave').single();
    const many = await admin.from('leave_types').select('name').single();
    const maybeNone = await admin.from('leave_types').select('name').eq('name', 'Nope').maybeSingle();

    expect(one.data).toEqual({ name: 'Sick Leave' });
    expect(many.error?.code).toBe('PGRST116');
    expect(maybeNone).toMatchObject({ data: null, error: null });
  });

  it('inserts, updates, upserts and deletes, returning rows only when asked', async () => {
    const name = `Test holiday ${runId}`;
    const inserted = await admin.from('holidays').insert({ holiday_date: '2031-01-02', name }).select('id, name').single();
    const silent = await admin.from('holidays').update({ name: `${name} renamed` }).eq('id', inserted.data!.id);
    const updated = await admin.from('holidays').update({ name }).eq('id', inserted.data!.id).select('name');
    const upserted = await admin
      .from('holidays')
      .upsert({ holiday_date: '2031-01-02', name: `${name} again` }, { onConflict: 'holiday_date' })
      .select('id, name');
    const removed = await admin.from('holidays').delete().eq('id', inserted.data!.id).select('id');

    expect(inserted.data?.name).toBe(name);
    expect(silent).toMatchObject({ data: null, error: null, status: 204 });
    expect(updated.data).toEqual([{ name }]);
    expect(upserted.data).toEqual([{ id: inserted.data!.id, name: `${name} again` }]);
    expect(removed.data).toEqual([{ id: inserted.data!.id }]);
  });

  it('calls database functions with typed arguments', async () => {
    const { data: days } = await people.clients.dev!.rpc('count_working_days', { p_start: '2026-11-09', p_end: '2026-11-15' });
    const { data: permissions } = await people.clients.dev!.rpc('get_my_permissions');
    const wrongName = await admin.rpc('count_working_days' as 'get_my_permissions', { p_from: '2026-11-09' } as never);

    expect(days).toBe(5);
    expect(wrongName.error?.code).toBe('PGRST202');
    expect(permissions?.some((row) => row.permission_key === 'tasks.view')).toBe(true);
  });

  it('passes the database error code through, for the app to explain', async () => {
    const duplicate = await admin.from('leave_types').insert({ name: 'Casual Leave' });
    const refused = await anonymousClient().from('leave_types').select('id');
    const unknown = await admin.from('leave_types').select('no_such_column');

    const inUse = await people.clients.founder!.from('departments').delete().eq('name', 'Design & Development');

    expect(isStillInUse(inUse.error!)).toBe(true);
    expect(inUse.status).toBe(409);
    expect(duplicate.error?.code).toBe('23505');
    expect(refused.error?.code).toBe('42501');
    expect(unknown.error?.code).toBe('42703');
  });
});
