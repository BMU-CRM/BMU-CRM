import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { chooseRange } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { movementKindLabels } from '@/lib/validation/ledgerSchema';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import { getActionAccess } from '@/server/services/accessService';
import { listMovements } from '@/server/services/ledgerService';

export async function GET(request: Request) {
  if (!(await getActionAccess(permissionKeys.ledgerManage))) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const { range } = chooseRange(params, todayInIndia(), 'this-month');
  const { movements } = await listMovements({
    from: range.from,
    to: range.to,
    accountId: parseId(params.accountId),
    direction: params.direction === 'in' || params.direction === 'out' ? params.direction : undefined,
    method: paymentMethods.find((method) => method === params.method),
    kind: Object.keys(movementKindLabels).find((kind) => kind === params.kind),
    search: params.search,
    page: 1,
    perPage: 100000,
  });

  const header = ['Date', 'Kind', 'Description', 'Party', 'Category', 'Account', 'Method', 'Reference', 'Money in', 'Money out'];
  const rows = [...movements]
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    .map((movement) => [
      csvCell(movement.occurred_on),
      csvCell(movementKindLabels[movement.kind] ?? movement.kind),
      csvCell(movement.description),
      csvCell(movement.counterparty),
      csvCell(movement.category_name),
      csvCell(movement.account_name),
      csvCell(paymentMethodLabels[movement.method]),
      csvCell(movement.reference),
      movement.direction === 'in' ? csvCell(Number(movement.amount)) : '',
      movement.direction === 'out' ? csvCell(Number(movement.amount)) : '',
    ]);
  return csvResponse(header, rows, `transactions-${range.from}-to-${range.to}.csv`);
}
