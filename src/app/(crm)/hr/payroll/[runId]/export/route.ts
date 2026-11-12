import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { parseId } from '@/lib/parseListParams';
import { getActionAccess } from '@/server/services/accessService';
import { getPayrollRun, listAllPayrollLines } from '@/server/services/payrollService';

// One row per payslip, for the bank upload or the accountant.
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const access = await getActionAccess();
  if (!access || (access.permissions[permissionKeys.payrollManage] === undefined && access.permissions[permissionKeys.payrollApprove] === undefined)) {
    return new Response('Not found', { status: 404 });
  }
  const runId = parseId((await params).runId);
  const run = runId ? await getPayrollRun(runId) : null;
  if (!run) return new Response('Not found', { status: 404 });

  const lines = await listAllPayrollLines(run.id);
  const header = [
    'Employee ID', 'Name', 'Department', 'Days in month', 'Paid days', 'Loss of pay days', 'Basic', 'HRA', 'Other allowances',
    'Special allowance', 'Incentive', 'Bonus', 'Overtime', 'Other earnings', 'Component earnings', 'Gross', 'PF', 'ESI',
    'Professional tax', 'TDS', 'Other deductions', 'Component deductions', 'Total deductions', 'Net pay', 'Employer PF', 'Employer ESI',
  ];
  const rows = lines.map((line) => [
    csvCell(line.employee?.employee_code),
    csvCell(line.employee?.full_name),
    csvCell(line.employee?.department?.name),
    csvCell(String(line.days_in_month)),
    csvCell(String(line.paid_days)),
    csvCell(String(line.lop_days)),
    ...[
      line.basic, line.hra, line.other_allowances, line.special_allowance, line.incentive, line.bonus, line.overtime_amount,
      line.other_earnings, line.component_earnings, line.gross_earnings, line.pf_employee, line.esi_employee, line.professional_tax,
      line.tds, line.other_deductions, line.component_deductions, line.total_deductions, line.net_pay, line.pf_employer, line.esi_employer,
    ].map((value) => csvCell(Number(value))),
  ]);

  return csvResponse(header, rows, `payroll-${run.month.slice(0, 7)}.csv`);
}
