import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { todayInIndia } from '@/lib/formatDate';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import { reimbursementStatusLabels } from '@/lib/validation/reimbursementSchema';
import { getActionAccess } from '@/server/services/accessService';
import { listClaimsForFinance, listPaidRuns } from '@/server/services/reimbursementService';

// Paid salaries for a year, or reimbursement claims with the page's filters.
export async function GET(request: Request) {
  if (!(await getActionAccess(permissionKeys.reimbursementsPay))) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;

  if (params.view === 'reimbursements') {
    const status = params.status === 'paid' || params.status === 'submitted' ? params.status : 'approved';
    const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : undefined;
    const claims = [];
    // Every page, not just the one on screen.
    for (let page = 1; page < 400; page += 1) {
      const { claims: batch, total } = await listClaimsForFinance({ status, search: params.search, month, page });
      claims.push(...batch);
      if (claims.length >= total || batch.length === 0) break;
    }
    return csvResponse(
      ['Employee', 'Employee ID', 'Category', 'Spent on', 'Details', 'Amount', 'Status', 'Paid on', 'Method', 'Reference'],
      claims.map((claim) => [
        csvCell(claim.employee?.full_name),
        csvCell(claim.employee?.employee_code),
        csvCell(claim.category?.name),
        csvCell(claim.expense_date),
        csvCell(claim.description),
        csvCell(Number(claim.amount)),
        csvCell(reimbursementStatusLabels[claim.status]),
        csvCell(claim.paid_on),
        csvCell(claim.payment_method ? paymentMethodLabels[claim.payment_method] : null),
        csvCell(claim.payment_reference),
      ]),
      `reimbursements-${status}${month ? `-${month}` : ''}.csv`,
    );
  }

  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : Number(todayInIndia().slice(0, 4));
  const runs = await listPaidRuns(year);
  return csvResponse(
    ['Month', 'People', 'Gross', 'Deductions', 'Net paid', 'Paid on', 'Method', 'Reference'],
    runs.map((run) => [
      csvCell(formatPayrollMonth(run.month)),
      csvCell(String(run.employee_count)),
      csvCell(Number(run.total_gross)),
      csvCell(Number(run.total_deductions)),
      csvCell(Number(run.total_net)),
      csvCell(run.paid_on),
      csvCell(run.payment_method ? paymentMethodLabels[run.payment_method] : null),
      csvCell(run.payment_reference),
    ]),
    `salaries-paid-${year}.csv`,
  );
}
