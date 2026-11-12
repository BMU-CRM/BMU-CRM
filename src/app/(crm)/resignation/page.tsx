import type { Metadata } from 'next';
import { ResignationForm } from '@/components/exits/ExitForms';
import { ResignationStatusBadge } from '@/components/exits/ResignationStatusBadge';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { withdrawResignationAction } from '@/server/actions/exitActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getNoticePeriod, getSettlement, listExitTasks, listMyResignations } from '@/server/services/exitService';

export const metadata: Metadata = { title: 'Resignation' };

export default async function ResignationPage() {
  const access = await requirePagePermission(permissionKeys.resignationSubmit);
  const today = todayInIndia();
  const [resignations, noticeDays] = await Promise.all([listMyResignations(access), getNoticePeriod()]);
  const current = resignations.find((resignation) => resignation.status === 'submitted' || resignation.status === 'approved') ?? null;
  const [tasks, settlement] = current?.status === 'approved' ? await Promise.all([listExitTasks(current.id), getSettlement(current.id)]) : [[], null];
  const past = resignations.filter((resignation) => resignation.id !== current?.id);

  return (
    <>
      <PageHeader title="Resignation" description="Resign here, and follow your exit until your last day." />
      <div className={layout.stack}>
        {current ? (
          <Panel
            title="Your resignation"
            action={
              current.status === 'submitted' && (
                <ConfirmActionButton
                  label="Withdraw"
                  title="Withdraw your resignation?"
                  description="HR and your manager are told. You can resign again later."
                  confirmLabel="Withdraw"
                  variant="secondary"
                  action={withdrawResignationAction.bind(null, current.id)}
                />
              )
            }
          >
            <dl className={layout.facts}>
              <div>
                <dt>Status</dt>
                <dd>
                  <ResignationStatusBadge status={current.status} />
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDate(current.submitted_on)}</dd>
              </div>
              <div>
                <dt>Last working day</dt>
                <dd>{current.last_working_day ? formatDate(current.last_working_day) : current.proposed_last_day ? `You proposed ${formatDate(current.proposed_last_day)}` : 'HR will confirm'}</dd>
              </div>
              {current.decision_note && (
                <div>
                  <dt>Note from HR</dt>
                  <dd>{current.decision_note}</dd>
                </div>
              )}
            </dl>
            {current.status === 'approved' && current.last_working_day && (
              <p className={`${layout.muted} ${layout.spaced}`}>
                Your sign-in stops working the day after your last working day. Save anything you need, such as your payslips, before then.
              </p>
            )}
          </Panel>
        ) : (
          <Panel title="Resign" description="HR decides and confirms your last working day. You can withdraw until then.">
            <ResignationForm today={today} noticeDays={noticeDays} />
          </Panel>
        )}
        {tasks.length > 0 && (
          <Panel title="Your exit checklist" description="HR ticks these off as you hand over." flush>
            <ul className={layout.list}>
              {tasks.map((task) => (
                <li key={task.id} className={layout.row}>
                  <span className={layout.rowMain}>{task.item_name}</span>
                  <StatusBadge tone={task.done_at ? 'good' : 'neutral'}>{task.done_at ? 'Done' : 'To do'}</StatusBadge>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {settlement && (
          <Panel title="Full and final settlement">
            <p>
              {settlement.status === 'paid'
                ? `Paid ${formatRupees(settlement.final_amount ?? 0)} on ${formatDate(settlement.paid_on)}.`
                : 'HR is preparing it. It is paid after your last working day.'}
            </p>
          </Panel>
        )}
        {past.length > 0 && (
          <Panel title="Earlier" flush>
            <ul className={layout.list}>
              {past.map((resignation) => (
                <li key={resignation.id} className={layout.row}>
                  <span className={layout.rowMain}>Submitted {formatDate(resignation.submitted_on)}</span>
                  <ResignationStatusBadge status={resignation.status} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
