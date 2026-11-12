import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { chooseRange } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import { getActionAccess } from '@/server/services/accessService';
import { listExpenses, listIncome, type LedgerFilters } from '@/server/services/ledgerService';

// The income or expense list as a spreadsheet, with the same filters as the page.
export async function GET(request: Request) {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const { range } = chooseRange(params, todayInIndia(), 'this-year');
  const filters: LedgerFilters = {
    search: params.search,
    categoryId: parseId(params.categoryId),
    accountId: parseId(params.accountId),
    method: paymentMethods.find((method) => method === params.method),
    from: range.from,
    to: range.to,
    removed: params.show === 'removed',
    sort: 'date-asc',
    page: 1,
  };

  if (params.view === 'income') {
    const { rows } = await listIncome(filters, true);
    const header = ['Date', 'Category', 'Client', 'Amount', 'Account', 'Method', 'Reference', 'Notes', 'Removed because'];
    return csvResponse(
      header,
      rows.map((row) => [csvCell(row.received_on), csvCell(row.category?.name), csvCell(row.client?.company_name), csvCell(Number(row.amount)), csvCell(row.account?.name), csvCell(paymentMethodLabels[row.method]), csvCell(row.reference), csvCell(row.notes), csvCell(row.delete_reason)]),
      `income-${range.from}-to-${range.to}.csv`,
    );
  }

  const { rows } = await listExpenses(filters, true);
  const header = ['Date', 'Category', 'Paid to', 'Department', 'Amount', 'Account', 'Method', 'Reference', 'Notes', 'Source', 'Removed because'];
  return csvResponse(
    header,
    rows.map((row) => [csvCell(row.spent_on), csvCell(row.category?.name), csvCell(row.vendor_name), csvCell(row.department?.name), csvCell(Number(row.amount)), csvCell(row.account?.name), csvCell(paymentMethodLabels[row.method]), csvCell(row.reference), csvCell(row.notes), csvCell(row.source), csvCell(row.delete_reason)]),
    `expenses-${range.from}-to-${range.to}.csv`,
  );
}