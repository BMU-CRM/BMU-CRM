import Link from 'next/link';
import styles from '@/components/ui/DataTable.module.css';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { EmployeeWorkload, summariseByDepartment } from '@/lib/tasks/calculateWorkload';
import type { TaskStage } from '@/lib/tasks/taskWorkflow';
import { WorkloadBadge } from './WorkloadBadge';

function percent(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

const stageColumns: { stage: TaskStage; heading: string }[] = [
  { stage: 'todo', heading: 'Yet to start' },
  { stage: 'doing', heading: 'Doing' },
  { stage: 'review', heading: 'In review' },
  { stage: 'done', heading: 'Done, 90 days' },
];

function tasksHref(filter: { assignee?: string; department?: string; stage?: TaskStage; overdue?: boolean }) {
  const query = new URLSearchParams({ view: 'all' });
  if (filter.assignee) query.set('assignee', filter.assignee);
  if (filter.department) query.set('department', filter.department);
  if (filter.stage) query.set('stage', filter.stage);
  if (filter.overdue) query.set('overdue', '1');
  return `/tasks?${query.toString()}`;
}

// A count that opens the matching tasks, or a plain zero.
function CountLink({ count, href, label }: { count: number; href: string | null; label: string }) {
  if (count === 0 || !href) return <>{count}</>;
  return (
    <Link href={href} className={styles.primaryLink} aria-label={label}>
      {count}
    </Link>
  );
}

function StageHeadings() {
  return stageColumns.map((column) => (
    <th key={column.stage} scope="col" className={styles.numeric}>
      {column.heading}
    </th>
  ));
}

// Each person's work by where it stands. Every count opens those tasks.
export function EmployeeWorkloadTable({ workloads }: { workloads: EmployeeWorkload[] }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Load</th>
            <th scope="col">Status</th>
            <StageHeadings />
            <th scope="col" className={styles.numeric}>
              Overdue
            </th>
            <th scope="col" className={styles.numeric}>
              Hours left
            </th>
          </tr>
        </thead>
        <tbody>
          {workloads.map((workload) => (
            <tr key={workload.employeeId}>
              <td>
                <Link href={tasksHref({ assignee: workload.employeeId })} className={`${styles.primaryText} ${styles.primaryLink}`}>
                  {workload.fullName}
                </Link>
                <p className={styles.secondaryText}>{workload.departmentName ?? 'No department'}</p>
              </td>
              <td>
                <ProgressBar value={Math.round(workload.utilisation * 100)} label={`${workload.fullName} workload`} />
              </td>
              <td>
                <WorkloadBadge indicator={workload.indicator} />
              </td>
              {stageColumns.map((column) => (
                <td key={column.stage} className={styles.numeric}>
                  <CountLink
                    count={workload.stageCounts[column.stage]}
                    href={tasksHref({ assignee: workload.employeeId, stage: column.stage })}
                    label={`${workload.fullName}: ${column.heading}`}
                  />
                </td>
              ))}
              <td className={styles.numeric}>
                <CountLink
                  count={workload.overdueTasks}
                  href={tasksHref({ assignee: workload.employeeId, overdue: true })}
                  label={`${workload.fullName}: overdue`}
                />
              </td>
              <td className={styles.numeric}>{workload.remainingHours.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmployeePerformanceTable({ workloads }: { workloads: EmployeeWorkload[] }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col" className={styles.numeric}>
              On time
            </th>
            <th scope="col" className={styles.numeric}>
              Avg quality
            </th>
            <th scope="col" className={styles.numeric}>
              Complexity delivered
            </th>
            <th scope="col" className={styles.numeric}>
              Estimate accuracy
            </th>
            <th scope="col" className={styles.numeric}>
              Completed
            </th>
          </tr>
        </thead>
        <tbody>
          {workloads.map((workload) => (
            <tr key={workload.employeeId}>
              <td className={styles.primaryText}>{workload.fullName}</td>
              <td className={styles.numeric}>{percent(workload.onTimeRate)}</td>
              <td className={styles.numeric}>{workload.averageQuality?.toFixed(1) ?? '—'}</td>
              <td className={styles.numeric}>{workload.complexityPoints}</td>
              <td className={styles.numeric}>{percent(workload.hoursAccuracy)}</td>
              <td className={styles.numeric}>{workload.completedTasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DepartmentRows = ReturnType<typeof summariseByDepartment>;

// departmentIds maps a department's name to its id, so its counts can open its tasks.
export function DepartmentWorkloadTable({
  departments,
  departmentIds,
}: {
  departments: DepartmentRows;
  departmentIds: Map<string, string>;
}) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col">Average load</th>
            <th scope="col" className={styles.numeric}>
              People
            </th>
            <StageHeadings />
            <th scope="col" className={styles.numeric}>
              Overdue
            </th>
          </tr>
        </thead>
        <tbody>
          {departments.map((department) => {
            const id = departmentIds.get(department.department);
            const href = (filter: { stage?: TaskStage; overdue?: boolean }) =>
              id ? tasksHref({ department: id, ...filter }) : null;
            return (
              <tr key={department.department}>
                <td className={styles.primaryText}>
                  {id ? (
                    <Link href={tasksHref({ department: id })} className={styles.primaryLink}>
                      {department.department}
                    </Link>
                  ) : (
                    department.department
                  )}
                </td>
                <td>
                  <ProgressBar value={Math.round(department.utilisation * 100)} label={`${department.department} workload`} />
                </td>
                <td className={styles.numeric}>{department.people}</td>
                {stageColumns.map((column) => (
                  <td key={column.stage} className={styles.numeric}>
                    <CountLink
                      count={department.stageCounts[column.stage]}
                      href={href({ stage: column.stage })}
                      label={`${department.department}: ${column.heading}`}
                    />
                  </td>
                ))}
                <td className={styles.numeric}>
                  <CountLink
                    count={department.overdueTasks}
                    href={href({ overdue: true })}
                    label={`${department.department}: overdue`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
