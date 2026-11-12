import { Stamp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LeaveDecisionButtons } from '@/components/hr/LeaveDecisionButtons';
import { TaskTable } from '@/components/tasks/TaskTable';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { DecisionButtons } from '@/components/ui/DecisionButtons';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { decideClaimAction } from '@/server/actions/reimbursementActions';
import { requireAccess, type CurrentAccess } from '@/server/services/accessService';
import { listResignations } from '@/server/services/exitService';
import { getLeaveBalances, listLeaveAwaitingDecision } from '@/server/services/hrService';
import { listPayrollRuns } from '@/server/services/payrollService';
import { listClaimsToDecide } from '@/server/services/reimbursementService';
import { listTasks } from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Approvals' };

type Tab = 'leave' | 'reimbursements' | 'payroll' | 'resignations';

const tabLabels: Record<Tab, string> = {
  leave: 'Leave and work',
  reimbursements: 'Reimbursements',
  payroll: 'Payroll runs',
  resignations: 'Resignations',
};

// Everything waiting for this person's decision, one tab for each kind they can decide.
// Reporting managers decide their team's claims whatever their role.
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const access = await requireAccess();
  const has = (key: string) => access.permissions[key] !== undefined;
  const claims = await listClaimsToDecide(access);

  const tabs: Tab[] = [
    ...(has(permissionKeys.leaveApprove) ? (['leave'] as const) : []),
    ...(has(permissionKeys.reimbursementsApprove) || claims.length > 0 ? (['reimbursements'] as const) : []),
    ...(has(permissionKeys.payrollApprove) ? (['payroll'] as const) : []),
    ...(has(permissionKeys.exitsManage) ? (['resignations'] as const) : []),
  ];
  if (tabs.length === 0) notFound();
  const requested = (await searchParams).tab;
  const tab = tabs.find((value) => value === requested) ?? tabs[0]!;

  return (
    <>
      <PageHeader title="Approvals" description="Everything waiting for your decision." />
      {tabs.length > 1 && (
        <PageTabs label="Approvals" tabs={tabs.map((value) => ({ href: `/approvals?tab=${value}`, label: tabLabels[value], current: value === tab }))} />
      )}
      {tab === 'leave' && <LeaveTab access={access} />}
      {tab === 'reimbursements' && <ClaimsTab claims={claims} />}
      {tab === 'payroll' && <PayrollTab />}
      {tab === 'resignations' && <ResignationsTab />}
    </>
  );
}

async function LeaveTab({ access }: { access: CurrentAccess }) {
  const [leave, { tasks }] = await Promise.all([
    listLeaveAwaitingDecision(access),
    access.permissions[permissionKeys.tasksView] !== undefined ? listTasks(access, { view: 'review', page: 1 }) : Promise.resolve({ tasks: [], total: 0 }),
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
                  const balance = balances.get(balanceKey(request.employee_id, request.start_date))?.find((row) => row.name === request.type?.name);
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
                          {request.type?.name} · {request.is_half_day ? 'half day' : `${request.days} ${request.days === 1 ? 'day' : 'days'}`}
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
        action={
          <ButtonLink href="/tasks?view=review" variant="ghost">
            Open in Tasks
          </ButtonLink>
        }
        flush
      >
        {tasks.length === 0 ? <p className={layout.emptyText}>Nothing to review.</p> : <TaskTable tasks={tasks} />}
      </Panel>
    </div>
  );
}

function ClaimsTab({ claims }: { claims: Awaited<ReturnType<typeof listClaimsToDecide>> }) {
  return (
    <Panel title="Reimbursement claims" description={`${claims.length} waiting, ${formatRupees(claims.reduce((sum, claim) => sum + Number(claim.amount), 0))} in all`} flush>
      {claims.length === 0 ? (
        <EmptyState icon={Stamp} title="Nothing waiting" description="Claims from people you manage appear here." />
      ) : (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Claim</th>
                <th scope="col" className={tableStyles.numeric}>Amount</th>
                <th scope="col" aria-label="Decision" />
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td>
                    <p className={tableStyles.primaryText}>{claim.employee?.full_name}</p>
                    <p className={tableStyles.secondaryText}>{claim.employee?.department?.name ?? 'No department'}</p>
                  </td>
                  <td>
                    <Link href={`/reimbursements/${claim.id}`} className={tableStyles.primaryLink}>
                      {claim.category?.name}
                    </Link>
                    <p className={tableStyles.secondaryText}>
                      {formatDate(claim.expense_date)} · {claim.description}
                    </p>
                    {claim.receipt ? (
                      <Link href={`/files/${claim.receipt.id}`} className={layout.link}>
                        {claim.receipt.name}
                      </Link>
                    ) : (
                      <p className={tableStyles.secondaryText}>No receipt attached</p>
                    )}
                  </td>
                  <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(claim.amount)}</td>
                  <td>
                    <div className={tableStyles.rowActions}>
                      <DecisionButtons id={claim.id} subject={`the claim from ${claim.employee?.full_name}`} decide={decideClaimAction.bind(null, claim.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

async function PayrollTab() {
  const { runs } = await listPayrollRuns({ status: 'in_review', page: 1 });
  return (
    <Panel title="Payroll runs" description={`${runs.length} waiting for approval`} flush>
      {runs.length === 0 ? (
        <EmptyState icon={Stamp} title="Nothing waiting" description="Payroll runs HR sends for approval appear here." />
      ) : (
        <ul className={layout.list}>
          {runs.map((run) => (
            <li key={run.id} className={layout.row}>
              <div className={layout.rowMain}>
                <p>
                  <span className={layout.rowTitle}>{formatPayrollMonth(run.month)}</span>{' '}
                  <span className={layout.muted}>
                    {run.employee_count} people · {formatRupees(run.total_net)} net · prepared by {run.preparer?.full_name ?? 'a former employee'}
                  </span>
                </p>
              </div>
              <ButtonLink href={`/hr/payroll/${run.id}/review`} variant="primary">
                Review
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function ResignationsTab() {
  const { resignations } = await listResignations({ status: 'submitted', sort: 'newest', page: 1 });
  return (
    <Panel title="Resignations" description={`${resignations.length} waiting for a decision`} flush>
      {resignations.length === 0 ? (
        <EmptyState icon={Stamp} title="Nothing waiting" description="New resignations appear here." />
      ) : (
        <ul className={layout.list}>
          {resignations.map((resignation) => (
            <li key={resignation.id} className={layout.row}>
              <div className={layout.rowMain}>
                <p>
                  <span className={layout.rowTitle}>{resignation.employee?.full_name}</span>{' '}
                  <span className={layout.muted}>
                    resigned {formatDate(resignation.submitted_on)}
                    {resignation.proposed_last_day ? `, asks to leave on ${formatDate(resignation.proposed_last_day)}` : ''}
                  </span>
                </p>
                <p className={layout.muted}>{resignation.reason}</p>
              </div>
              <ButtonLink href={`/hr/exits/${resignation.id}`} variant="primary">
                Open
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
