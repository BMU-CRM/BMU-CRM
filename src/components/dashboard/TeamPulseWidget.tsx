import { AppLink as Link } from '@/components/ui/AppLink';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateTime, todayInIndia } from '@/lib/formatDate';
import { chooseWorkloadPeriod } from '@/lib/workload/workloadPeriod';
import { formatHours, workloadTotals } from '@/lib/workload/workloadReport';
import type { CurrentAccess } from '@/server/services/accessService';
import { getWorkloadActivity, getWorkloads, getWorkloadFlags, listWorkloadReports } from '@/server/services/workloadService';

// The day at a glance for those who track the team: today's work against yesterday's,
// what needs attention, and (for whoever receives them) the latest reports.
export async function TeamPulseWidget({ access }: { access: CurrentAccess }) {
  const has = (key: string) => access.permissions[key] !== undefined;
  const seesWorkload = has(permissionKeys.workloadView);
  const receives = has(permissionKeys.workloadReportReceive);
  const today = todayInIndia();
  const yesterday = chooseWorkloadPeriod({ period: 'day', date: today }, today).previous;

  const [todayRows, yesterdayRows, flags, workloads, reports] = await Promise.all([
    seesWorkload ? getWorkloadActivity({ from: today, to: today }) : Promise.resolve([]),
    seesWorkload ? getWorkloadActivity({ from: yesterday, to: yesterday }) : Promise.resolve([]),
    seesWorkload ? getWorkloadFlags() : Promise.resolve([]),
    seesWorkload ? getWorkloads() : Promise.resolve([]),
    receives ? listWorkloadReports(3) : Promise.resolve([]),
  ]);
  const now = workloadTotals(todayRows);
  const before = workloadTotals(yesterdayRows);
  const openFlags = flags.filter((flag) => !flag.note);
  // Today's figure large, yesterday's in the label.
  const versus = (label: string, value: number, previous: number, hours = false) => ({
    label: `${label} (yesterday ${hours ? formatHours(previous) : previous})`,
    value: hours ? formatHours(value) : value,
  });

  return (
    <Panel
      title="Team pulse"
      description="Today so far, against yesterday"
      action={
        seesWorkload ? (
          <ButtonLink href="/workload/report" variant="ghost">
            Day report
          </ButtonLink>
        ) : undefined
      }
    >
      {seesWorkload && (
        <>
          <StatTiles
            tiles={[
              versus('Submitted for review', now.submitted, before.submitted),
              versus('Approved or completed', now.approved, before.approved),
              versus('Sent back for rework', now.sent_back, before.sent_back),
              versus('Hours on tasks', now.hours_worked, before.hours_worked, true),
            ]}
          />
          <div className={layout.spaced}>
            <StatTiles
              tiles={[
                { label: 'Red flags open', value: openFlags.length, href: '/workload/flags' },
                { label: 'Overloaded people', value: workloads.filter((person) => person.indicator === 'overloaded').length, href: '/workload' },
                { label: 'Idle people', value: openFlags.filter((flag) => flag.kind === 'idle').length, href: '/workload/flags' },
              ]}
            />
          </div>
        </>
      )}
      {receives && (
        <div className={layout.spaced}>
          <p className={layout.rowTitle}>Latest reports</p>
          {reports.length === 0 ? (
            <p className={layout.muted}>No reports received yet.</p>
          ) : (
            <ul className={layout.list}>
              {reports.map((report) => (
                <li key={report.id} className={layout.row}>
                  <div className={layout.rowMain}>
                    <Link href={`/workload/reports/${report.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                      {report.title}
                    </Link>
                    <p className={layout.muted}>
                      {report.sent_by_name} · {formatDateTime(report.created_at)}
                    </p>
                  </div>
                  <span className={layout.rowActions}>
                    {report.reviewed_at ? <StatusBadge tone="good">Reviewed</StatusBadge> : <StatusBadge tone="warning">Not reviewed</StatusBadge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
