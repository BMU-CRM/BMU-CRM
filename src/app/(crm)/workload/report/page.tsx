import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { SendWorkloadReportForm } from '@/components/workload/SendWorkloadReportForm';
import { WorkloadActivityDepartmentTable, WorkloadActivityTable } from '@/components/workload/WorkloadActivityTables';
import { WorkloadTabs } from '@/components/workload/WorkloadTabs';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { chooseWorkloadPeriod, workloadPeriodLabel } from '@/lib/workload/workloadPeriod';
import { formatHours, workloadTotals } from '@/lib/workload/workloadReport';
import { requirePagePermission } from '@/server/services/accessService';
import { getWorkloadActivity } from '@/server/services/workloadService';

export const metadata: Metadata = { title: 'Workload report' };

type WorkloadReportPageProps = {
  searchParams: Promise<{ period?: string; date?: string }>;
};

const periodOptions = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week (Mon–Sun)' },
];

export default async function WorkloadReportPage({ searchParams }: WorkloadReportPageProps) {
  const access = await requirePagePermission(permissionKeys.workloadView);
  const today = todayInIndia();
  const period = chooseWorkloadPeriod(await searchParams, today);
  const rows = await getWorkloadActivity(period);
  const totals = workloadTotals(rows);
  const label = workloadPeriodLabel(period);
  const canSend = access.permissions[permissionKeys.workloadReportSend] !== undefined;
  const href = (date: string) => `/workload/report?period=${period.kind}&date=${date}`;

  return (
    <>
      <PageHeader
        title="Workload"
        description="What each person did in a day or a week, and where their open work stood at the end of it. Tasks count for the person they are assigned to."
        actions={
          <ButtonLink href={`/workload/report/export?period=${period.kind}&date=${period.date}`} prefetch={false}>
            <Download size={16} aria-hidden="true" />
            Download CSV
          </ButtonLink>
        }
      />
      <div className={layout.stack}>
        <WorkloadTabs access={access} current="report" />
        <form method="get" className={filterStyles.filters}>
          <SelectField label="Report for" name="period" options={periodOptions} defaultValue={period.kind} />
          <TextField label={period.kind === 'week' ? 'Any day in the week' : 'Day'} name="date" type="date" defaultValue={period.date} max={today} />
          <div className={filterStyles.actions}>
            <ButtonLink href={href(period.previous)} variant="ghost" aria-label={`Previous ${period.kind}`}>
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </ButtonLink>
            {period.next && (
              <ButtonLink href={href(period.next)} variant="ghost" aria-label={`Next ${period.kind}`}>
                Next
                <ChevronRight size={16} aria-hidden="true" />
              </ButtonLink>
            )}
            <button type="submit">Show</button>
          </div>
        </form>

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

        <Panel
          title={`By person, ${label}`}
          description="Hours count only while a task is in progress. Columns marked “at end” show where the work stood at the end of the day or week."
          flush
        >
          {rows.length === 0 ? <p className={layout.emptyText}>Nobody in your reach has work tracked.</p> : <WorkloadActivityTable rows={rows} />}
        </Panel>

        <Panel title="By department" flush>
          <WorkloadActivityDepartmentTable rows={rows} />
        </Panel>

        {canSend && (
          <Panel
            title="Send this report"
            description={`Sends the ${period.kind === 'week' ? 'week' : 'day'} of ${label} to the Founder, with the figures as they are now. It appears on their Received reports page and they are notified.`}
          >
            <SendWorkloadReportForm period={period.kind} date={period.date} />
          </Panel>
        )}
      </div>
    </>
  );
}
