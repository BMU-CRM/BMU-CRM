import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/formatDate';
import type { EmployeeDetails } from '@/server/services/employeeService';
import { EmployeeAccountBadge } from './EmployeeAccountBadge';
import styles from './EmployeeProfileDetails.module.css';

const employmentStatusLabels: Record<string, string> = {
  active: 'Active',
  on_leave: 'On leave',
  notice_period: 'Notice period',
  exited: 'Exited',
};

export function EmployeeProfileDetails({ employee }: { employee: EmployeeDetails }) {
  return (
    <Panel>
      <div className={styles.identity}>
        <PersonAvatar name={employee.full_name} size="large" />
        <div className={styles.identityText}>
          <h2 className={styles.name}>{employee.full_name}</h2>
          <p className={styles.muted}>{employee.designation?.title ?? 'No designation'}</p>
          <div className={styles.badges}>
            <EmployeeAccountBadge isActive={employee.is_active} inviteAcceptedAt={employee.invite_accepted_at} />
            <StatusBadge>{employee.role?.name}</StatusBadge>
          </div>
        </div>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Employee ID</dt>
          <dd>{employee.employee_code}</dd>
        </div>
        <div>
          <dt>Work email</dt>
          <dd>{employee.work_email}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{employee.phone ?? 'Not set'}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{employee.department?.name ?? 'None'}</dd>
        </div>
        <div>
          <dt>Reports to</dt>
          <dd>
            {employee.manager ? (
              <Link href={`/people/employees/${employee.manager.id}`} className={styles.link}>
                {employee.manager.full_name}
              </Link>
            ) : (
              'No one'
            )}
          </dd>
        </div>
        <div>
          <dt>Joining date</dt>
          <dd>{formatDate(employee.joining_date)}</dd>
        </div>
        <div>
          <dt>Employment status</dt>
          <dd>{employmentStatusLabels[employee.employment_status]}</dd>
        </div>
        <div>
          <dt>Skills</dt>
          <dd>{employee.skills.length > 0 ? employee.skills.join(', ') : 'None added'}</dd>
        </div>
      </dl>
    </Panel>
  );
}
