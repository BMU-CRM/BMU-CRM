import { Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppLink as Link } from '@/components/ui/AppLink';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { WorkloadTabs } from '@/components/workload/WorkloadTabs';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateTime } from '@/lib/formatDate';
import { workloadPeriodLabel } from '@/lib/workload/workloadPeriod';
import { requireAccess } from '@/server/services/accessService';
import { listWorkloadReports } from '@/server/services/workloadService';

export const metadata: Metadata = { title: 'Workload reports' };

// For those who receive workload reports: every report sent. Those who send them see
// their own.
export default async function WorkloadReportsPage() {
  const access = await requireAccess();
  const receives = access.permissions[permissionKeys.workloadReportReceive] !== undefined;
  if (!receives && access.permissions[permissionKeys.workloadReportSend] === undefined) notFound();

  const reports = await listWorkloadReports();

  return (
    <>
      <PageHeader
        title={receives ? 'Received reports' : 'Sent reports'}
        description={
          receives
            ? 'Workload reports sent by Client Managers and HR, newest first. Each keeps the figures as they were when sent.'
            : 'Workload reports you have sent, newest first.'
        }
      />
      <div className={layout.stack}>
        <WorkloadTabs access={access} current="received" />
        <Panel flush>
          {reports.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No reports yet"
              description={receives ? 'Reports sent to you appear here.' : 'Send one from the Day or week report.'}
            />
          ) : (
            <ul className={layout.list}>
              {reports.map((report) => {
                const kind = report.period === 'week' ? 'week' : 'day';
                return (
                  <li key={report.id} className={layout.row}>
                    <div className={layout.rowMain}>
                      <div className={layout.badges}>
                        <StatusBadge>{kind === 'week' ? 'Week' : 'Day'}</StatusBadge>
                      </div>
                      <Link href={`/workload/reports/${report.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                        {report.title}
                      </Link>
                      <p className={layout.muted}>
                        {workloadPeriodLabel({ kind, from: report.period_from, to: report.period_to })} · Sent by {report.sent_by_name} ·{' '}
                        {formatDateTime(report.created_at)}
                      </p>
                      {report.note && <p className={layout.text}>{report.note}</p>}
                    </div>
                    <span className={layout.rowActions}>
                      <ButtonLink href={`/workload/reports/${report.id}`} variant="ghost">
                        View
                      </ButtonLink>
                      <ButtonLink href={`/workload/reports/${report.id}/export`} variant="ghost" prefetch={false}>
                        Download
                      </ButtonLink>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
