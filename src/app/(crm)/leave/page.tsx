import type { Metadata } from 'next';
import { LeaveRequestForm } from '@/components/hr/LeaveRequestForm';
import { LeaveStatusBadge } from '@/components/hr/LeaveStatusBadge';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { cancelLeaveAction } from '@/server/actions/hrActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getLeaveBalances, listLeaveTypes, listMyLeave, listMyRecentFiles } from '@/server/services/hrService';
import { Plane } from 'lucide-react';

export const metadata: Metadata = { title: 'Leave' };

function formatDays(days: number) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export default async function LeavePage() {
  const access = await requirePagePermission(permissionKeys.leaveRequest);
  const today = todayInIndia();

  const [balances, leaveTypes, requests, files] = await Promise.all([
    getLeaveBalances(),
    listLeaveTypes(),
    listMyLeave(access),
    listMyRecentFiles(access),
  ]);

  return (
    <>
      <PageHeader title="Leave" description={`Your balances for ${today.slice(0, 4)}. Pending requests are already counted.`} />
      <div className={layout.stack}>
        <StatTiles
          tiles={balances.map((balance) => ({
            label: balance.name,
            value: balance.remaining === null ? 'No limit' : `${balance.remaining} left`,
          }))}
        />
        <div className={layout.columns}>
          <Panel title="My requests" flush>
            {requests.length === 0 ? (
              <EmptyState icon={Plane} title="No leave yet" description="Requests you make appear here." />
            ) : (
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Dates</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => {
                      const canCancel =
                        request.status === 'pending' || (request.status === 'approved' && request.start_date > today);
                      return (
                        <tr key={request.id}>
                          <td>
                            <p className={tableStyles.primaryText}>
                              {formatDate(request.start_date)}
                              {request.end_date !== request.start_date ? ` to ${formatDate(request.end_date)}` : ''}
                            </p>
                            <p className={tableStyles.secondaryText}>
                              {request.is_half_day ? 'Half day' : formatDays(request.days)} · {request.reason}
                            </p>
                          </td>
                          <td>{request.type?.name}</td>
                          <td>
                            <LeaveStatusBadge status={request.status} />
                            {request.decision_note && <p className={tableStyles.secondaryText}>“{request.decision_note}”</p>}
                          </td>
                          <td>
                            {canCancel && (
                              <div className={tableStyles.rowActions}>
                                <ConfirmActionButton
                                  label="Cancel"
                                  title="Cancel this leave?"
                                  description="The days go back into your balance, and your manager is told if it was already approved."
                                  confirmLabel="Cancel leave"
                                  variant="secondary"
                                  action={cancelLeaveAction.bind(null, request.id)}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Request leave" description="Weekends and holidays are not counted.">
            <LeaveRequestForm
              leaveTypes={leaveTypes
                .filter((type) => type.is_active)
                .map((type) => ({ value: type.id, label: type.requires_attachment ? `${type.name} (needs a document)` : type.name }))}
              files={files.map((file) => ({ value: file.id, label: file.name }))}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
