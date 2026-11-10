import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { WorkloadBadge } from '@/components/workload/WorkloadBadge';
import { getWorkloads } from '@/server/services/workloadService';

export async function TeamWorkloadWidget() {
  const workloads = (await getWorkloads()).slice(0, 5);

  return (
    <Panel
      title="Workload"
      description="Busiest people first"
      action={<ButtonLink href="/workload" variant="ghost">View all</ButtonLink>}
      flush
    >
      <ul className={layout.list}>
        {workloads.map((workload) => (
          <li key={workload.employeeId} className={layout.row}>
            <div className={layout.rowMain}>
              <p className={layout.rowTitle}>{workload.fullName}</p>
              <p className={layout.muted}>
                {workload.activeTasks} active · {workload.overdueTasks} overdue
              </p>
            </div>
            <span className={layout.rowActions}>
              <ProgressBar value={Math.round(workload.utilisation * 100)} label={`${workload.fullName} workload`} />
              <WorkloadBadge indicator={workload.indicator} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
