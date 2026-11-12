import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InterviewOutcomeForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatFileSize } from '@/lib/files/fileTypes';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { interviewModeLabels } from '@/lib/validation/recruitmentSchema';
import { requireAccess } from '@/server/services/accessService';
import { getCandidate, getInterview, listCandidateFiles } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Interview' };

// For the interviewer as well as recruiters: the candidate's details and files, and the
// feedback form. Row level security shows each interviewer only their own interviews.
export default async function InterviewPage({ params, searchParams }: { params: Promise<{ interviewId: string }>; searchParams: Promise<{ from?: string }> }) {
  await requireAccess();
  const interviewId = parseId((await params).interviewId);
  if (!interviewId) notFound();
  const interview = await getInterview(interviewId);
  if (!interview) notFound();
  const [candidate, files] = await Promise.all([getCandidate(interview.candidate_id), listCandidateFiles(interview.candidate_id)]);
  const returnTo = (await searchParams).from === 'candidate' ? `/hr/recruitment/candidates/${interview.candidate_id}` : `/interviews/${interview.id}`;

  return (
    <>
      <PageHeader
        title={`${interview.round_name}: ${interview.candidate?.full_name ?? 'Candidate'}`}
        description={`${formatDateTime(interview.scheduled_at)} · ${interviewModeLabels[interview.mode]} · ${interview.duration_minutes} minutes${interview.interviewer ? ` · with ${interview.interviewer.full_name}` : ''}`}
      />
      <div className={layout.columns}>
        <Panel title="Your feedback">
          <InterviewOutcomeForm interview={interview} returnTo={returnTo} />
        </Panel>
        <div className={layout.stack}>
          {candidate && (
            <Panel title="Candidate">
              <dl className={layout.factsStacked}>
                <div>
                  <dt>Position</dt>
                  <dd>{candidate.position ?? candidate.opening?.title ?? '—'}</dd>
                </div>
                <div>
                  <dt>Experience</dt>
                  <dd>{candidate.experience_years !== null ? `${candidate.experience_years} years` : '—'}</dd>
                </div>
                <div>
                  <dt>Skills</dt>
                  <dd>{candidate.skills.length ? candidate.skills.join(', ') : '—'}</dd>
                </div>
                {candidate.expected_salary !== null && (
                  <div>
                    <dt>Expected salary</dt>
                    <dd>{formatRupees(candidate.expected_salary)}</dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}
          <Panel title="Where" flush>
            <p className={layout.emptyText}>
              {interview.meeting_link ? (
                <a href={interview.meeting_link} target="_blank" rel="noreferrer noopener" className={layout.link}>
                  Join the video call
                </a>
              ) : (
                (interview.location ?? 'No location given.')
              )}
            </p>
          </Panel>
          <Panel title="Files" flush>
            {files.length === 0 ? (
              <p className={layout.emptyText}>No files.</p>
            ) : (
              <ul className={layout.list}>
                {files.map((file) => (
                  <li key={file.id} className={layout.row}>
                    <a
                      href={file.kind === 'link' && file.external_url ? file.external_url : `/files/${file.id}/download?mode=view`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={layout.link}
                    >
                      {file.name}
                    </a>
                    <span className={layout.muted}>{file.kind === 'link' ? 'Link' : formatFileSize(file.size_bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
