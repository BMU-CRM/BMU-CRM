import { CalendarClock } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/lib/formatDate';
import { interviewStatusLabels } from '@/lib/validation/recruitmentSchema';
import { requireAccess } from '@/server/services/accessService';
import { listMyInterviews } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'My interviews' };

// Interviews someone takes, for recording feedback. Anyone can be asked to interview.
export default async function MyInterviewsPage() {
  const access = await requireAccess();
  const interviews = await listMyInterviews(access);

  return (
    <>
      <PageHeader title="My interviews" description="Interviews you are asked to take. Open one to see the candidate and record feedback." />
      <Panel flush>
        {interviews.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No interviews" description="When HR asks you to interview someone, it appears here and on your calendar." />
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Candidate</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((interview) => (
                  <tr key={interview.id}>
                    <td>
                      <Link href={`/interviews/${interview.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                        {formatDateTime(interview.scheduled_at)}
                      </Link>
                      <p className={tableStyles.secondaryText}>{interview.round_name}</p>
                    </td>
                    <td>
                      <p>{interview.candidate?.full_name}</p>
                      <p className={tableStyles.secondaryText}>{interview.candidate?.position ?? ''}</p>
                    </td>
                    <td>
                      <StatusBadge tone={interview.status === 'completed' ? 'good' : interview.status === 'cancelled' ? 'critical' : 'warning'}>
                        {interviewStatusLabels[interview.status]}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
