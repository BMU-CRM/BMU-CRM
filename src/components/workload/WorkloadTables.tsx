import Link from 'next/link';
import styles from '@/components/ui/DataTable.module.css';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { EmployeeWorkload, summariseByDepartment } from '@/lib/tasks/calculateWorkload';
import { WorkloadBadge } from './WorkloadBadge';

function percent(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function EmployeeWorkloadTable({ workloads }: { workloads: EmployeeWorkload[] }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Load</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.numeric}>
              Active
            </th>
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
                <Link href={`/people/employees/${workload.employeeId}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
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
              <td className={styles.numeric}>{workload.activeTasks}</td>
              <td className={styles.numeric}>{workload.overdueTasks}</td>
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

export function DepartmentWorkloadTable({ departments }: { departments: DepartmentRows }) {
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
            <th scope="col" className={styles.numeric}>
              Active
            </th>
            <th scope="col" className={styles.numeric}>
              Overdue
            </th>
          </tr>
        </thead>
        <tbody>
          {departments.map((department) => (
            <tr key={department.department}>
              <td className={styles.primaryText}>{department.department}</td>
              <td>
                <ProgressBar value={Math.round(department.utilisation * 100)} label={`${department.department} workload`} />
              </td>
              <td className={styles.numeric}>{department.people}</td>
              <td className={styles.numeric}>{department.activeTasks}</td>
              <td className={styles.numeric}>{department.overdueTasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
