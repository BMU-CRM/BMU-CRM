import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import type { CurrentAccess } from '@/server/services/accessService';
import styles from './DashboardWidgets.module.css';

export function MyProfileWidget({ access }: { access: CurrentAccess }) {
  const { employee } = access;

  return (
    <Panel title="My profile" action={<ButtonLink href="/profile" variant="ghost">View</ButtonLink>}>
      <div className={styles.identity}>
        <PersonAvatar name={employee.full_name} />
        <div>
          <p className={styles.name}>{employee.full_name}</p>
          <p className={styles.muted}>{employee.designation?.title ?? 'No designation'}</p>
        </div>
      </div>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Employee ID</dt>
          <dd>{employee.employee_code}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Department</dt>
          <dd>{employee.department?.name ?? 'None'}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Role</dt>
          <dd>{employee.role?.name}</dd>
        </div>
      </dl>
    </Panel>
  );
}
