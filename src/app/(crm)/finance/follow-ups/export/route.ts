import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvCell, csvResponse } from '@/lib/csv/csvCell';
import { todayInIndia } from '@/lib/formatDate';
import { followUpStatusLabels } from '@/lib/validation/followUpSchema';
import { getActionAccess } from '@/server/services/accessService';
import { getFollowUpBoard, readFollowUpFilters } from '@/server/services/followUpService';

// The follow-up board as a spreadsheet, with the same filters as the page.
export async function GET(request: Request) {
  if (!(await getActionAccess(permissionKeys.followupsManage))) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const today = todayInIndia();
  const { all } = await getFollowUpBoard(readFollowUpFilters(params), today);
  return csvResponse(
    ['Client', 'Client manager', 'Invoice', 'For', 'Due date', 'Days overdue', 'Total', 'Received', 'Balance', 'Status', 'Last contacted', 'Last note', 'Next follow-up', 'Promised by'],
    all.map((row) => [
      csvCell(row.client_name),
      csvCell(row.client_manager),
      csvCell(row.invoice_number),
      csvCell(row.title),
      csvCell(row.due_date),
      csvCell(String(row.days_overdue)),
      csvCell(Number(row.total)),
      csvCell(Number(row.amount_paid)),
      csvCell(Number(row.balance)),
      csvCell(followUpStatusLabels[row.status]),
      csvCell(row.last_contacted_on),
      csvCell(row.last_note),
      csvCell(row.next_follow_up_on),
      csvCell(row.promised_on),
    ]),
    `payment-follow-ups-${today}.csv`,
  );
}
