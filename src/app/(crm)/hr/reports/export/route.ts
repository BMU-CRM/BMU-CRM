import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { employmentStatusLabels } from '@/lib/employees/employeeRecordLabels';
import { chooseRange } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { summariseLeave } from '@/lib/hr/hrReports';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { getActionAccess } from '@/server/services/accessService';
import { getPeopleReport } from '@/server/services/hrReportService';
import { getLeaveUtilisation } from '@/server/services/hrService';
import { listPaidRuns } from '@/server/services/reimbursementService';

// Each HR report tab as a spreadsheet, with the same period as the page.
export async function GET(request: Request) {
  const access = await getActionAccess(permissionKeys.hrDashboard);
  if (!access) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const { range } = chooseRange(params, todayInIndia(), 'this-year');
  const year = Number(range.to.slice(0, 4));

  if (params.view === 'leave') {
    const rows = summariseLeave(await getLeaveUtilisation(year));
    return csvResponse(
      ['Leave type', 'People', 'Days allowed', 'Approved days', 'Waiting days'],
      rows.map((row) => [csvCell(row.leaveType), csvCell(String(row.people)), csvCell(row.allowance === null ? 'No limit' : String(row.allowance)), csvCell(String(row.approved)), csvCell(String(row.pending))]),
      `leave-${year}.csv`,
    );
  }

  if (params.view === 'payroll') {
    if (access.permissions[permissionKeys.payrollManage] === undefined && access.permissions[permissionKeys.payrollApprove] === undefined) {
      return new Response('Not found', { status: 404 });
    }
    const runs = await listPaidRuns(year);
    return csvResponse(
      ['Month', 'People', 'Gross', 'Deductions', 'Net paid', 'Paid on'],
      [...runs].reverse().map((run) => [csvCell(formatPayrollMonth(run.month)), csvCell(String(run.employee_count)), csvCell(Number(run.total_gross)), csvCell(Number(run.total_deductions)), csvCell(Number(run.total_net)), csvCell(run.paid_on)]),
      `salaries-${year}.csv`,
    );
  }

  const report = await getPeopleReport(range);
  if (params.view === 'movement') {
    const rows = [
      ...report.joiners.map((person) => [csvCell('Joined'), csvCell(person.full_name), csvCell(person.employee_code), csvCell(person.department), csvCell(person.joining_date), '']),
      ...report.leavers.map((row) => [csvCell('Left'), csvCell(row.person?.full_name ?? 'Former employee'), csvCell(row.person?.employee_code), csvCell(row.person?.department), csvCell(row.last_working_day), csvCell(row.reason)]),
    ];
    return csvResponse(['Movement', 'Employee', 'Employee ID', 'Department', 'Date', 'Reason'], rows, `joinings-and-leavers-${range.from}-to-${range.to}.csv`);
  }

  const rows = [
    ...report.byDepartment.map((row) => [csvCell('Department'), csvCell(row.name), csvCell(String(row.count))]),
    ...report.byType.map((row) => [csvCell('Employment type'), csvCell(row.name), csvCell(String(row.count))]),
    ...report.byStatus.map((row) => [csvCell('Status'), csvCell(employmentStatusLabels[row.name] ?? row.name), csvCell(String(row.count))]),
  ];
  return csvResponse(['Group', 'Name', 'People'], rows, `headcount-${todayInIndia()}.csv`);
}
