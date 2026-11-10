import { History } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { describeAuditEntry } from '@/lib/audit/describeAuditEntry';
import { formatDateTime } from '@/lib/formatDate';
import { listRecentActivity } from '@/server/services/auditService';
import styles from './DashboardWidgets.module.css';

export async function RecentActivityWidget() {
  const activity = await listRecentActivity(6);

  return (
    <Panel
      title="Recent activity"
      action={<ButtonLink href="/settings/audit-log" variant="ghost">View all</ButtonLink>}
      flush
    >
      {activity.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Changes across the organisation appear here." />
      ) : (
        <ul className={styles.list}>
          {activity.map((entry) => (
            <li key={entry.id} className={styles.activity}>
              <div>
                <p>{describeAuditEntry(entry)}</p>
                <p className={styles.muted}>{entry.actor_name}</p>
              </div>
              <time className={styles.activityTime} dateTime={entry.created_at}>
                {formatDateTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
