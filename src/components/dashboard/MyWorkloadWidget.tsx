import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { WorkloadBadge } from '@/components/workload/WorkloadBadge';
import { weeklyCapacityHours, type WorkloadIndicator } from '@/lib/tasks/calculateWorkload';
import { getMyWorkload } from '@/server/services/workloadService';

const advice: Record<WorkloadIndicator, string> = {
  underutilised: 'You have room for more work this week.',
  balanced: 'Your week is about right.',
  overloaded: 'You have more work than fits in a week. Talk to your manager about what can wait.',
};

function hours(value: number) {
  return `${Math.round(value * 10) / 10}h`;
}

// The person's own open work against a 40-hour week, using the same calculation as the
// Workload page. Urgent and overdue work counts for more.
export async function MyWorkloadWidget() {
  const workload = await getMyWorkload();
  if (!workload) return null;

  const percentage = Math.round(workload.utilisation * 100);

  return (
    <Panel
      title="My workload"
      description={`Your open work against a ${weeklyCapacityHours}-hour week`}
      action={<ButtonLink href="/tasks" variant="ghost">My tasks</ButtonLink>}
    >
      <div className={layout.badges}>
        <WorkloadBadge indicator={workload.indicator} />
        {percentage > 100 && <span className={layout.muted}>{percentage}% of a week</span>}
      </div>
      <div className={layout.spaced}>
        <ProgressBar value={percentage} label="My workload" />
      </div>
      <p className={`${layout.muted} ${layout.spaced}`}>{advice[workload.indicator]}</p>
      <dl className={`${layout.facts} ${layout.spaced}`}>
        <div>
          <dt>Work left</dt>
          <dd>{hours(workload.remainingHours)}</dd>
        </div>
        <div>
          <dt>Open tasks</dt>
          <dd>{workload.activeTasks}</dd>
        </div>
        <div>
          <dt>Overdue</dt>
          <dd>{workload.overdueTasks}</dd>
        </div>
        <div>
          <dt>On time (90 days)</dt>
          <dd>{workload.onTimeRate === null ? 'No finished work yet' : `${Math.round(workload.onTimeRate * 100)}%`}</dd>
        </div>
      </dl>
    </Panel>
  );
}
