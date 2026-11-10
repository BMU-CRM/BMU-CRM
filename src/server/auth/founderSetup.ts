// Creates the first account, which everyone else is then invited from. Used by the
// setup page on a fresh install and by the founder:create command.
import type { SqlDatabase } from '@/server/database/sqlDatabase';
import { createAuthUser, deleteAuthUser } from './authAccounts';

export async function founderExists(db: SqlDatabase) {
  const { rows } = await db.query<{ found: boolean }>(
    `select exists (
       select 1 from public.employees e join public.roles r on r.id = e.role_id where r.name = 'Founder'
     ) as found`,
  );
  return rows[0]?.found === true;
}

export async function createFounder(db: SqlDatabase, founder: { name: string; email: string; password: string }) {
  if (await founderExists(db)) throw new Error('A Founder account already exists.');

  const email = founder.email.trim().toLowerCase();
  const userId = await createAuthUser(db, { email, password: founder.password, fullName: founder.name });

  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.employees (auth_user_id, full_name, work_email, role_id, designation_id, department_id, invite_accepted_at)
       select $1, $2, $3,
         (select id from public.roles where name = 'Founder'),
         (select id from public.designations where title = 'Founder'),
         (select id from public.departments where name = 'Management'),
         now()
       returning id`,
      [userId, founder.name.trim(), email],
    );
    if (!rows[0]) throw new Error('The employee record could not be created.');
    return { userId, employeeId: rows[0].id };
  } catch (error) {
    await deleteAuthUser(db, userId);
    throw error;
  }
}
