import { Stamp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LeaveDecisionButtons } from '@/components/hr/LeaveDecisionButtons';
import { TaskTable } from '@/components/tasks/TaskTable';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getLeaveBalances, listLeaveAwaitingDecision } from '@/server/services/hrService';
import { listTasks } from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Approvals' };

// Everything waiting for this person's decision, in one place. Later phases add
// quotations, invoices and expenses here.
export default async function ApprovalsPage() {
  const access = await requirePagePermission(permissionKeys.leaveApprove);

  const [leave, { tasks }] = await Promise.all([
    listLeaveAwaitingDecision(access),
    access.permissions[permissionKeys.tasksView] !== undefined
      ? listTasks(access, { view: 'review', page: 1 })
      : Promise.resolve({ tasks: [], total: 0 }),
  ]);

  // Each person's balance for the year the leave falls in. Pending requests are
  // already counted, so this is what is left if everything is approved.
  const balanceKey = (employeeId: string, startDate: string) => `${employeeId}:${startDate.slice(0, 4)}`;
  const balances = new Map(
    await Promise.all(
      [...new Set(leave.map((request) => balanceKey(request.employee_id, request.start_date)))].map(async (key) => {
        const [employeeId, year] = key.split(':') as [string, string];
        return [key, await getLeaveBalances(employeeId, Number(year))] as const;
      }),
    ),
  );

  return (
    <>
      <PageHeader title="Approvals" description="Leave requests and work waiting for your decision." />
      <div className={layout.stack}>
        <Panel title="Leave requests" description={`${leave.length} waiting`} flush>
          {leave.length === 0 ? (
            <EmptyState icon={Stamp} title="Nothing waiting" description="Leave requests from your team appear here." />
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Leave</th>
                    <th scope="col">Left if approved</th>
                    <th scope="col" aria-label="Decision" />
                  </tr>
                </thead>
                <tbody>
                  {leave.map((request) => {
                    const balance = balances
                      .get(balanceKey(request.employee_id, request.start_date))
                      ?.find((row) => row.name === request.type?.name);
                    return (
                      <tr key={request.id}>
                        <td>
                          <Link href={`/people/employees/${request.employee_id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                            {request.employee?.full_name}
                          </Link>
                          <p className={tableStyles.secondaryText}>{request.employee?.department?.name ?? 'No department'}</p>
                        </td>
                        <td>
                          <p>
                            {request.type?.name} ·{' '}
                            {request.is_half_day ? 'half day' : `${request.days} ${request.days === 1 ? 'day' : 'days'}`}
                          </p>
                          <p className={tableStyles.secondaryText}>
                            {formatDate(request.start_date)}
                            {request.end_date !== request.start_date ? ` to ${formatDate(request.end_date)}` : ''} · {request.reason}
                          </p>
                          {request.attachment && (
                            <Link href={`/files/${request.attachment.id}`} className={layout.link}>
                              {request.attachment.name}
                            </Link>
                          )}
                        </td>
                        <td>{balance?.remaining === null || balance === undefined ? 'No limit' : `${balance.remaining} days`}</td>
                        <td>
                          <div className={tableStyles.rowActions}>
                            <LeaveDecisionButtons requestId={request.id} employeeName={request.employee?.full_name ?? 'this person'} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel
          title="Work to review"
          description={`${tasks.length} tasks waiting for your sign-off`}
          action={<ButtonLink href="/tasks?view=review" variant="ghost">Open in Tasks</ButtonLink>}
          flush
        >
          {tasks.length === 0 ? <p className={layout.emptyText}>Nothing to review.</p> : <TaskTable tasks={tasks} />}
        </Panel>
      </div>
    </>
  );
}
