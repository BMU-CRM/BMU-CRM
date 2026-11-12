import 'server-only';
import type { DateRange } from '@/lib/finance/financialPeriods';
import { summarisePeople, type ReportPerson } from '@/lib/hr/hrReports';
import { createDatabaseClient } from '@/server/database/databaseClient';

// Headcount, joinings and leavers for the period. Read with the viewer's own access, so
// it covers the people they may see.
export async function getPeopleReport(range: DateRange) {
  const database = await createDatabaseClient();
  const [people, leavers] = await Promise.all([
    database
      .from('employees')
      .select(
        `id, employee_code, full_name, employment_status, joining_date, is_active,
         department:departments!employees_department_id_fkey(name), designation:designations(title), employment_type:employment_types(name)`,
      )
      .order('full_name'),
    database
      .from('resignations')
      .select('employee_id, last_working_day, reason')
      .in('status', ['approved', 'completed'])
      .not('last_working_day', 'is', null),
  ]);
  if (people.error) throw people.error;
  if (leavers.error) throw leavers.error;

  const rows: ReportPerson[] = people.data.map((person) => ({
    id: person.id,
    employee_code: person.employee_code,
    full_name: person.full_name,
    employment_status: person.employment_status,
    joining_date: person.joining_date,
    is_active: person.is_active,
    department: person.department?.name ?? null,
    designation: person.designation?.title ?? null,
    employment_type: person.employment_type?.name ?? null,
  }));
  return summarisePeople(
    rows,
    leavers.data.map((row) => ({ employee_id: row.employee_id, last_working_day: row.last_working_day as string, reason: row.reason })),
    range,
  );
}

export type PeopleReport = Awaited<ReturnType<typeof getPeopleReport>>;
