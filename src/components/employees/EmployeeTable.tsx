import Link from 'next/link';
import { PresenceDot } from '@/components/presence/PresenceDot';
import styles from '@/components/ui/DataTable.module.css';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import type { EmployeeDetails } from '@/server/services/employeeService';
import { EmployeeAccountBadge } from './EmployeeAccountBadge';
import tableStyles from './EmployeeTable.module.css';

export function EmployeeTable({ employees }: { employees: EmployeeDetails[] }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Designation</th>
            <th scope="col">Department</th>
            <th scope="col">Reports to</th>
            <th scope="col">Account</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td>
                <div className={tableStyles.person}>
                  <span className={tableStyles.avatar}>
                    <PersonAvatar name={employee.full_name} size="small" />
                    <PresenceDot employeeId={employee.id} variant="overlay" />
                  </span>
                  <div>
                    <Link href={`/people/employees/${employee.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                      {employee.full_name}
                    </Link>
                    <p className={styles.secondaryText}>
                      {employee.employee_code} · {employee.work_email}
                    </p>
                  </div>
                </div>
              </td>
              <td>{employee.designation?.title ?? '—'}</td>
              <td>{employee.department?.name ?? '—'}</td>
              <td>{employee.manager?.full_name ?? '—'}</td>
              <td>
                <EmployeeAccountBadge isActive={employee.is_active} inviteAcceptedAt={employee.invite_accepted_at} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
