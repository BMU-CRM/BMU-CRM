import { FileText, Printer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExitInterviewForm } from '@/components/exits/ExitForms';
import { ResignationStatusBadge } from '@/components/exits/ResignationStatusBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { exitCategoryLabels } from '@/lib/validation/exitSchema';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import { setExitTaskAction } from '@/server/actions/exitActions';
import { requireAccess } from '@/server/services/accessService';
import { getResignation, getSettlement, listExitTasks, listOpenTasksFor } from '@/server/services/exitService';
import { listLetterTemplates } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Exit' };

function toLocalInput(timestamp: string | null) {
  if (!timestamp) return null;
  return new Date(new Date(timestamp).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);
}

export default async function ExitPage({ params }: { params: Promise<{ resignationId: string }> }) {
  const access = await requireAccess();
  const canManage = access.permissions[permissionKeys.exitsManage] !== undefined;
  const canPay = access.permissions[permissionKeys.payrollApprove] !== undefined;
  if (!canManage && !canPay) notFound();

  const resignationId = parseId((await params).resignationId);
  if (!resignationId) notFound();
  const resignation = await getResignation(resignationId);
  if (!resignation) notFound();

  const isLeaving = resignation.status === 'approved' || resignation.status === 'completed';
  const [tasks, settlement, openTasks, templates] = await Promise.all([
    isLeaving ? listExitTasks(resignation.id) : Promise.resolve([]),
    isLeaving ? getSettlement(resignation.id) : Promise.resolve(null),
    canManage && isLeaving ? listOpenTasksFor(resignation.employee_id) : Promise.resolve([]),
    canManage && isLeaving ? listLetterTemplates() : Promise.resolve([]),
  ]);
  const done = tasks.filter((task) => task.done_at).length;
  const leavingLetters = templates.filter((template) => template.is_active && (template.kind === 'relieving' || template.kind === 'experience'));
  const employee = resignation.employee;

  return (
    <>
      <PageHeader
        title={`Exit: ${employee?.full_name ?? 'Employee'}`}
        description={[employee?.employee_code, employee?.designation?.title, employee?.department?.name].filter(Boolean).join(' · ')}
        actions={
          canManage &&
          resignation.status === 'submitted' && (
            <ButtonLink href={`/hr/exits/${resignation.id}/decide`} variant="primary">
              Accept or reject
            </ButtonLink>
          )
        }
      />
      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel title="Resignation">
            <dl className={layout.facts}>
              <div>
                <dt>Status</dt>
                <dd>
                  <ResignationStatusBadge status={resignation.status} />
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDate(resignation.submitted_on)}</dd>
              </div>
              <div>
                <dt>Proposed last day</dt>
                <dd>{resignation.proposed_last_day ? formatDate(resignation.proposed_last_day) : '—'}</dd>
              </div>
              <div>
                <dt>Last working day</dt>
                <dd>{resignation.last_working_day ? formatDate(resignation.last_working_day) : 'Not decided'}</dd>
              </div>
              <div>
                <dt>Notice period</dt>
                <dd>{resignation.notice_days !== null ? `${resignation.notice_days} days` : 'Not set'}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{employee?.joining_date ? formatDate(employee.joining_date) : '—'}</dd>
              </div>
            </dl>
            <p className={`${layout.text} ${layout.spaced}`}>{resignation.reason}</p>
            {resignation.decision_note && (
              <p className={`${layout.muted} ${layout.spaced}`}>
                {resignation.decider?.full_name ?? 'HR'}: {resignation.decision_note}
              </p>
            )}
            {resignation.status === 'approved' && (
              <p className={`${layout.muted} ${layout.spaced}`}>Sign-in stops automatically the night after the last working day.</p>
            )}
          </Panel>

          {isLeaving && canManage && (
            <Panel title="Exit checklist" description={`${done} of ${tasks.length} done`} flush>
              <div className={layout.sectionForm}>
                <ProgressBar value={tasks.length ? Math.round((done / tasks.length) * 100) : 0} label={`${done} of ${tasks.length} done`} />
              </div>
              <ul className={layout.list}>
                {tasks.map((task) => (
                  <li key={task.id} className={layout.row}>
                    <span className={layout.rowMain}>
                      <span className={layout.rowTitle}>{task.item_name}</span>{' '}
                      <span className={layout.muted}>{exitCategoryLabels[task.category] ?? task.category}</span>
                      {task.done_at && (
                        <p className={layout.muted}>
                          Done {formatDateTime(task.done_at)}
                          {task.doer ? ` by ${task.doer.full_name}` : ''}
                        </p>
                      )}
                    </span>
                    <ActionButton
                      label={task.done_at ? 'Undo' : 'Mark done'}
                      variant={task.done_at ? 'ghost' : 'secondary'}
                      action={setExitTaskAction.bind(null, resignation.id, task.id, !task.done_at)}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {isLeaving && canManage && (
            <Panel title="Open tasks to hand over" description="Work still assigned to this person." flush>
              {openTasks.length === 0 ? (
                <p className={layout.emptyText}>Nothing open.</p>
              ) : (
                <ul className={layout.list}>
                  {openTasks.map((task) => (
                    <li key={task.id} className={layout.row}>
                      <Link href={`/tasks/${task.id}`} className={layout.link}>
                        {task.title}
                      </Link>
                      <span className={layout.muted}>{task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {isLeaving && canManage && (
            <Panel title="Exit interview">
              <ExitInterviewForm
                resignationId={resignation.id}
                interviewAt={toLocalInput(resignation.exit_interview_at)}
                notes={resignation.exit_interview_notes}
              />
            </Panel>
          )}
        </div>

        <div className={layout.stack}>
          {settlement && (
            <Panel
              title="Full and final settlement"
              action={
                <ButtonLink href={`/hr/exits/${resignation.id}/settlement/print`} variant="ghost">
                  <Printer size={16} aria-hidden="true" />
                  Statement
                </ButtonLink>
              }
            >
              <dl className={layout.factsStacked}>
                <div>
                  <dt>Final amount</dt>
                  <dd className={layout.rowTitle}>{formatRupees(settlement.final_amount ?? 0)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge tone={settlement.status === 'paid' ? 'good' : 'warning'}>{settlement.status === 'paid' ? 'Paid' : 'Not paid yet'}</StatusBadge>
                    {settlement.status === 'paid' && settlement.paid_on && (
                      <p className={layout.muted}>
                        {formatDate(settlement.paid_on)} by {paymentMethodLabels[settlement.payment_method ?? 'other']}
                        {settlement.payment_reference ? `, ${settlement.payment_reference}` : ''}
                      </p>
                    )}
                  </dd>
                </div>
              </dl>
              <div className={`${layout.badges} ${layout.spaced}`}>
                {canManage && settlement.status === 'draft' && (
                  <ButtonLink href={`/hr/exits/${resignation.id}/settlement`}>Prepare settlement</ButtonLink>
                )}
                {canPay && settlement.status === 'draft' && (
                  <ButtonLink href={`/hr/exits/${resignation.id}/settlement/pay`} variant="primary">
                    Mark as paid
                  </ButtonLink>
                )}
              </div>
            </Panel>
          )}
          {leavingLetters.length > 0 && (
            <Panel title="Letters">
              <ul className={layout.factsStacked}>
                {leavingLetters.map((template) => (
                  <li key={template.id}>
                    <Link href={`/letters/${template.id}/print?employee=${resignation.employee_id}`} className={`${layout.link} ${layout.badges}`}>
                      <FileText size={16} aria-hidden="true" /> {template.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
