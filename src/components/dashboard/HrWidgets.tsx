import { AttendanceTodayPanel } from '@/components/hr/AttendanceTodayPanel';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDate } from '@/lib/formatDate';
import type { CurrentAccess } from '@/server/services/accessService';
import { getLeaveBalances, getTodayAttendance, listLeaveAwaitingDecision } from '@/server/services/hrService';

export async function AttendanceTodayWidget({ access }: { access: CurrentAccess }) {
  return <AttendanceTodayPanel record={await getTodayAttendance(access)} />;
}

export async function LeaveBalanceWidget() {
  const balances = await getLeaveBalances();

  return (
    <Panel title="Leave balance" action={<ButtonLink href="/leave" variant="ghost">Request</ButtonLink>} flush>
      <ul className={layout.list}>
        {balances.map((balance) => (
          <li key={balance.leave_type_id} className={layout.row}>
            <span className={layout.rowMain}>{balance.name}</span>
            <span className={layout.rowTitle}>{balance.remaining === null ? 'No limit' : `${balance.remaining} days`}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export async function LeaveApprovalsWidget({ access }: { access: CurrentAccess }) {
  const requests = await listLeaveAwaitingDecision(access);

  return (
    <Panel
      title="Leave to approve"
      description={`${requests.length} waiting`}
      action={<ButtonLink href="/approvals" variant="ghost">Review</ButtonLink>}
      flush
    >
      {requests.length === 0 ? (
        <p className={layout.emptyText}>Nothing waiting.</p>
      ) : (
        <ul className={layout.list}>
          {requests.slice(0, 5).map((request) => (
            <li key={request.id} className={layout.row}>
              <div className={layout.rowMain}>
                <p className={layout.rowTitle}>{request.employee?.full_name}</p>
                <p className={layout.muted}>
                  {request.type?.name} · {formatDate(request.start_date)}
                  {request.end_date !== request.start_date ? ` to ${formatDate(request.end_date)}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
