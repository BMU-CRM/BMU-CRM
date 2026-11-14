import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { RecruitmentTabs } from '@/components/recruitment/RecruitmentTabs';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateTime } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { interviewModeLabels, interviewStatusLabels } from '@/lib/validation/recruitmentSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { interviewsPerPage, listInterviews } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Interviews' };

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ when?: string; status?: string; page?: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const params = await searchParams;
  const when = params.when === 'past' ? 'past' : 'upcoming';
  const status = Object.keys(interviewStatusLabels).find((key) => key === params.status);
  const page = parsePage(params.page);
  const { interviews, total } = await listInterviews({ when, status, page });

  return (
    <>
      <PageHeader title="Recruitment" description="Interviews are also on the calendar of whoever takes them." />
      <RecruitmentTabs current="interviews" />
      <form method="get" className={filterStyles.filters}>
        <SelectField
          label="Show"
          name="when"
          options={[
            { value: 'upcoming', label: 'Upcoming, soonest first' },
            { value: 'past', label: 'Past, latest first' },
          ]}
          defaultValue={when}
        />
        <SelectField label="Status" name="status" options={Object.entries(interviewStatusLabels).map(([value, label]) => ({ value, label }))} placeholder="Any status" defaultValue={status} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/hr/recruitment/interviews" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {interviews.length === 0 ? (
          <EmptyState icon={CalendarClock} title={when === 'upcoming' ? 'No upcoming interviews' : 'No past interviews'} description="Schedule interviews from a candidate's page." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Candidate</th>
                    <th scope="col">Interviewer</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.map((interview) => (
                    <tr key={interview.id}>
                      <td>
                        <p className={tableStyles.primaryText}>{formatDateTime(interview.scheduled_at)}</p>
                        <p className={tableStyles.secondaryText}>
                          {interview.round_name} · {interviewModeLabels[interview.mode]} · {interview.duration_minutes} min
                        </p>
                      </td>
                      <td>
                        <Link href={`/hr/recruitment/candidates/${interview.candidate_id}`} className={tableStyles.primaryLink}>
                          {interview.candidate?.full_name}
                        </Link>
                        <p className={tableStyles.secondaryText}>{interview.candidate?.position ?? ''}</p>
                      </td>
                      <td>{interview.interviewer?.full_name ?? '—'}</td>
                      <td>
                        <StatusBadge tone={interview.status === 'completed' ? 'good' : interview.status === 'cancelled' ? 'critical' : 'warning'}>
                          {interviewStatusLabels[interview.status]}
                          {interview.rating ? `, ${interview.rating} of 5` : ''}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className={tableStyles.rowActions}>
                          <ButtonLink href={`/interviews/${interview.id}`} variant="ghost">
                            Feedback
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              perPage={interviewsPerPage}
              total={total}
              hrefForPage={(target) => `/hr/recruitment/interviews?${new URLSearchParams({ when, ...(status ? { status } : {}), page: String(target) })}`}
            />
          </>
        )}
      </Panel>
    </>
  );
}
