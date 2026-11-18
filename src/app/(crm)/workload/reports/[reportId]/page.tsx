import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { WorkloadActivityDepartmentTable, WorkloadActivityTable } from '@/components/workload/WorkloadActivityTables';
import { formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { workloadPeriodLabel } from '@/lib/workload/workloadPeriod';
import { formatHours, workloadTotals } from '@/lib/workload/workloadReport';
import { requireAccess } from '@/server/services/accessService';
import { getWorkloadReport } from '@/server/services/workloadService';

export const metadata: Metadata = { title: 'Workload report' };

type WorkloadReportViewProps = { params: Promise<{ reportId: string }> };

// One sent report, with its figures as they were when sent. Who can open it is decided
// by the database: the sender, and those who receive workload reports.
export default async function WorkloadReportView({ params }: WorkloadReportViewProps) {
  await requireAccess();
  const reportId = parseId((await params).reportId);
  if (!reportId) notFound();
  const report = await getWorkloadReport(reportId);
  if (!report) notFound();
  const totals = workloadTotals(report.rows);

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${workloadPeriodLabel({ kind: report.kind, from: report.period_from, to: report.period_to })} · Sent by ${report.sent_by_name} on ${formatDateTime(report.created_at)}. The figures are as they were when sent.`}
        actions={
          <ButtonLink href={`/workload/reports/${report.id}/export`} prefetch={false}>
            <Download size={16} aria-hidden="true" />
            Download CSV
          </ButtonLink>
        }
      />
      <div className={layout.stack}>
        {report.note && (
          <Panel title="Note">
            <p className={layout.text}>{report.note}</p>
          </Panel>
        )}
        <StatTiles
          tiles={[
            { label: 'Assigned', value: totals.assigned },
            { label: 'Submitted for review', value: totals.submitted },
            { label: 'Sent back for rework', value: totals.sent_back },
            { label: 'Approved or completed', value: totals.approved },
            { label: 'Hours worked', value: formatHours(totals.hours_worked) },
            { label: 'Overdue at end', value: totals.overdue },
          ]}
        />
        <Panel title="By person" flush>
          <WorkloadActivityTable rows={report.rows} />
        </Panel>
        <Panel title="By department" flush>
          <WorkloadActivityDepartmentTable rows={report.rows} />
        </Panel>
      </div>
    </>
  );
}
