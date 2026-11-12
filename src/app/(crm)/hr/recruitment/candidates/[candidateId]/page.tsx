import { CalendarPlus, FileText, Pencil, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileUploader } from '@/components/files/FileUploader';
import { CandidateStageForm } from '@/components/recruitment/RecruitmentForms';
import { CandidateStageBadge } from '@/components/recruitment/RecruitmentTabs';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatFileSize } from '@/lib/files/fileTypes';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { interviewModeLabels, interviewStatusLabels } from '@/lib/validation/recruitmentSchema';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getCandidate,
  listCandidateFiles,
  listCandidateInterviews,
  listEmployeeOnboarding,
  listLetterTemplates,
} from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Candidate' };

export default async function CandidatePage({ params }: { params: Promise<{ candidateId: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const candidateId = parseId((await params).candidateId);
  if (!candidateId) notFound();
  const candidate = await getCandidate(candidateId);
  if (!candidate) notFound();

  const [interviews, files, templates, onboarding] = await Promise.all([
    listCandidateInterviews(candidate.id),
    listCandidateFiles(candidate.id),
    listLetterTemplates(),
    candidate.employee_id ? listEmployeeOnboarding(candidate.employee_id) : Promise.resolve([]),
  ]);
  const offerTemplates = templates.filter((template) => template.kind === 'offer' && template.is_active);
  const canConvert = !candidate.employee_id && ['selected', 'offer_released', 'offer_accepted'].includes(candidate.stage);

  return (
    <>
      <PageHeader
        title={candidate.full_name}
        description={[candidate.position ?? candidate.opening?.title, candidate.department?.name].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <ButtonLink href={`/hr/recruitment/candidates/${candidate.id}/edit`}>
              <Pencil size={16} aria-hidden="true" />
              Edit
            </ButtonLink>
            {!candidate.employee_id && (
              <ButtonLink href={`/hr/recruitment/candidates/${candidate.id}/interviews/new`}>
                <CalendarPlus size={16} aria-hidden="true" />
                Schedule interview
              </ButtonLink>
            )}
            {canConvert && (
              <ButtonLink href={`/hr/recruitment/candidates/${candidate.id}/convert`} variant="primary">
                <UserPlus size={16} aria-hidden="true" />
                Convert to employee
              </ButtonLink>
            )}
          </>
        }
      />
      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.facts}>
              <div>
                <dt>Stage</dt>
                <dd>
                  <CandidateStageBadge stage={candidate.stage} />
                  <p className={layout.muted}>since {formatDate(candidate.stage_changed_at.slice(0, 10))}</p>
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{candidate.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{candidate.phone ?? '—'}</dd>
              </div>
              <div>
                <dt>Experience</dt>
                <dd>{candidate.experience_years !== null ? `${candidate.experience_years} years` : '—'}</dd>
              </div>
              <div>
                <dt>Current salary</dt>
                <dd>{candidate.current_salary !== null ? formatRupees(candidate.current_salary) : '—'}</dd>
              </div>
              <div>
                <dt>Expected salary</dt>
                <dd>{candidate.expected_salary !== null ? formatRupees(candidate.expected_salary) : '—'}</dd>
              </div>
              <div>
                <dt>Skills</dt>
                <dd>{candidate.skills.length ? candidate.skills.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{candidate.source ?? '—'}</dd>
              </div>
              <div>
                <dt>Portfolio</dt>
                <dd>
                  {candidate.portfolio_url ? (
                    <a href={candidate.portfolio_url} target="_blank" rel="noreferrer noopener" className={layout.link}>
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            {candidate.notes && <p className={`${layout.text} ${layout.spaced}`}>{candidate.notes}</p>}
          </Panel>
          <Panel title="Interviews" flush>
            {interviews.length === 0 ? (
              <p className={layout.emptyText}>No interviews yet.</p>
            ) : (
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Round</th>
                      <th scope="col">Interviewer</th>
                      <th scope="col">Outcome</th>
                      <th scope="col" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((interview) => (
                      <tr key={interview.id}>
                        <td>
                          <p className={tableStyles.primaryText}>{interview.round_name}</p>
                          <p className={tableStyles.secondaryText}>
                            {formatDateTime(interview.scheduled_at)} · {interviewModeLabels[interview.mode]}
                          </p>
                        </td>
                        <td>{interview.interviewer?.full_name ?? '—'}</td>
                        <td>
                          <StatusBadge tone={interview.status === 'completed' ? 'good' : interview.status === 'cancelled' ? 'critical' : 'warning'}>
                            {interviewStatusLabels[interview.status]}
                            {interview.rating ? `, ${interview.rating} of 5` : ''}
                          </StatusBadge>
                          {interview.feedback && <p className={tableStyles.secondaryText}>{interview.feedback}</p>}
                        </td>
                        <td>
                          <div className={tableStyles.rowActions}>
                            <ButtonLink href={`/interviews/${interview.id}?from=candidate`} variant="ghost">
                              Feedback
                            </ButtonLink>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Files" description="Resume and other documents. Seen by recruiters and this candidate's interviewers." flush>
            {files.length === 0 ? (
              <p className={layout.emptyText}>No files yet.</p>
            ) : (
              <ul className={layout.list}>
                {files.map((file) => (
                  <li key={file.id} className={layout.row}>
                    <span className={layout.rowMain}>
                      {file.kind === 'link' && file.external_url ? (
                        <a href={file.external_url} target="_blank" rel="noreferrer noopener" className={layout.link}>
                          {file.name}
                        </a>
                      ) : (
                        <a href={`/files/${file.id}/download?mode=view`} target="_blank" rel="noreferrer" className={layout.link}>
                          {file.name}
                        </a>
                      )}{' '}
                      <span className={layout.muted}>{file.kind === 'link' ? 'Link' : formatFileSize(file.size_bytes)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className={layout.sectionForm}>
              <FileUploader links={{ candidateId: candidate.id }} compact />
            </div>
          </Panel>
        </div>
        <div className={layout.stack}>
          {candidate.stage !== 'joined' && (
            <Panel title="Move to stage" description="Joined is set by converting to an employee.">
              <CandidateStageForm candidateId={candidate.id} stage={candidate.stage} />
            </Panel>
          )}
          <Panel title="Offer">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Designation</dt>
                <dd>{candidate.offered_designation?.title ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Yearly CTC</dt>
                <dd>{candidate.offered_salary !== null ? formatRupees(candidate.offered_salary) : 'Not set'}</dd>
              </div>
              <div>
                <dt>Joining date</dt>
                <dd>{candidate.offered_joining_date ? formatDate(candidate.offered_joining_date) : 'Not set'}</dd>
              </div>
            </dl>
            {offerTemplates.length > 0 && (
              <ul className={`${layout.factsStacked} ${layout.spaced}`}>
                {offerTemplates.map((template) => (
                  <li key={template.id}>
                    <Link href={`/letters/${template.id}/print?candidate=${candidate.id}`} className={`${layout.link} ${layout.badges}`}>
                      <FileText size={16} aria-hidden="true" /> Print {template.name.toLowerCase()}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {candidate.employee_id && (
            <Panel title="Joined" description="Converted to an employee.">
              <p>
                <Link href={`/people/employees/${candidate.employee_id}`} className={layout.link}>
                  Open the employee record
                </Link>
              </p>
              {onboarding.length > 0 && (
                <p className={layout.muted}>
                  Onboarding: {onboarding.filter((task) => task.done_at).length} of {onboarding.length} done.{' '}
                  <Link href="/hr/recruitment/onboarding" className={layout.link}>
                    Open onboarding
                  </Link>
                </p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
