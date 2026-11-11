import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { employmentStatusLabels } from '@/lib/employees/employeeRecordLabels';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { getActionAccess } from '@/server/services/accessService';
import { listEmployeesForExport } from '@/server/services/employeeService';

// The employee directory as a spreadsheet, with the same filters and the same people as
// the Employees page. Work details only: personal, ID and bank details are never exported.
export async function GET(request: Request) {
  const access = await getActionAccess(permissionKeys.employeesView);
  if (!access) return new Response('Not found', { status: 404 });

  const params = new URL(request.url).searchParams;
  const accountStatus = params.get('accountStatus');
  const employees = await listEmployeesForExport(access, {
    search: params.get('search') ?? undefined,
    departmentId: parseId(params.get('departmentId') ?? undefined),
    roleId: parseId(params.get('roleId') ?? undefined),
    accountStatus: accountStatus === 'active' || accountStatus === 'inactive' ? accountStatus : undefined,
  });

  const header = [
    'Employee ID', 'Name', 'Work email', 'Phone', 'Department', 'Designation', 'Role', 'Reports to',
    'Joining date', 'Employment type', 'Employment status', 'Probation (months)', 'Probation ends', 'Confirmation date', 'Account',
  ];
  const rows = employees.map((employee) => [
    csvCell(employee.employee_code),
    csvCell(employee.full_name),
    csvCell(employee.work_email),
    csvCell(employee.phone),
    csvCell(employee.department?.name),
    csvCell(employee.designation?.title),
    csvCell(employee.role?.name),
    csvCell(employee.manager?.full_name),
    csvCell(employee.joining_date),
    csvCell(employee.employment_type?.name),
    csvCell(employmentStatusLabels[employee.employment_status]),
    csvCell(employee.probation_months === null ? null : String(employee.probation_months)),
    csvCell(employee.probation_end_date),
    csvCell(employee.confirmation_date),
    csvCell(employee.is_active ? 'Active' : 'Deactivated'),
  ]);

  return csvResponse(header, rows, `employees-${todayInIndia()}.csv`);
}
