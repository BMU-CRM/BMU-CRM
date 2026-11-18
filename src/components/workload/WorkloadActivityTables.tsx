import styles from '@/components/ui/DataTable.module.css';
import {
  formatHours,
  workloadByDepartment,
  workloadCountColumns,
  workloadTotals,
  type WorkloadActivity,
  type WorkloadCount,
} from '@/lib/workload/workloadReport';

function Figure({ column, value }: { column: WorkloadCount; value: number }) {
  return <>{column === 'hours_worked' ? formatHours(value) : value}</>;
}

function Headings() {
  return workloadCountColumns.map((column) => (
    <th key={column.key} scope="col" className={styles.numeric}>
      {column.heading}
      {column.part === 'end' ? ' (at end)' : ''}
    </th>
  ));
}

// Each person's day or week, with a total line.
export function WorkloadActivityTable({ rows }: { rows: WorkloadActivity[] }) {
  const totals = workloadTotals(rows);
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <Headings />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_id}>
              <th scope="row">
                <p className={styles.primaryText}>{row.full_name}</p>
                <p className={styles.secondaryText}>
                  {[row.designation_title, row.department_name ?? 'No department'].filter(Boolean).join(' · ')}
                </p>
              </th>
              {workloadCountColumns.map((column) => (
                <td key={column.key} className={styles.numeric}>
                  <Figure column={column.key} value={row[column.key]} />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">
              <p className={styles.primaryText}>Total</p>
              <p className={styles.secondaryText}>
                {rows.length} {rows.length === 1 ? 'person' : 'people'}
              </p>
            </th>
            {workloadCountColumns.map((column) => (
              <td key={column.key} className={styles.numeric}>
                <strong>
                  <Figure column={column.key} value={totals[column.key]} />
                </strong>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function WorkloadActivityDepartmentTable({ rows }: { rows: WorkloadActivity[] }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Department</th>
            <th scope="col" className={styles.numeric}>
              People
            </th>
            <Headings />
          </tr>
        </thead>
        <tbody>
          {workloadByDepartment(rows).map((group) => (
            <tr key={group.department}>
              <th scope="row">{group.department}</th>
              <td className={styles.numeric}>{group.people}</td>
              {workloadCountColumns.map((column) => (
                <td key={column.key} className={styles.numeric}>
                  <Figure column={column.key} value={group.totals[column.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
