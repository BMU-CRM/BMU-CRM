import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import type { CurrentAccess } from '@/server/services/accessService';
import { getDepartmentHeadcount } from '@/server/services/dashboardService';
import styles from './DepartmentHeadcountWidget.module.css';

export async function DepartmentHeadcountWidget({ access }: { access: CurrentAccess }) {
  const rows = await getDepartmentHeadcount(access);
  const largest = Math.max(1, ...rows.map((row) => row.headcount));

  return (
    <Panel title="Employees by department" description="Active employees">
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No employees yet" description="Headcount appears here once employees are added." />
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={row.department} className={styles.row} title={`${row.department}: ${row.headcount}`}>
              <span className={styles.label}>{row.department}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.bar} style={{ width: `${(row.headcount / largest) * 100}%` }} />
              </span>
              <span className={styles.value}>{row.headcount}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
