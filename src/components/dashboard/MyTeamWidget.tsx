import { UsersRound } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { listMyTeam } from '@/server/services/dashboardService';
import styles from './DashboardWidgets.module.css';

export async function MyTeamWidget() {
  const team = await listMyTeam();

  return (
    <Panel title="My team" description={`${team.length} ${team.length === 1 ? 'person' : 'people'} in your reporting line`} flush>
      {team.length === 0 ? (
        <EmptyState icon={UsersRound} title="No one reports to you yet" description="People appear here when you are set as their reporting manager." />
      ) : (
        <ul className={styles.list}>
          {team.slice(0, 8).map((member) => (
            <li key={member.id}>
              <Link href={`/people/employees/${member.id}`} className={styles.person}>
                <PersonAvatar name={member.full_name} size="small" />
                <div>
                  <p className={styles.name}>{member.full_name}</p>
                  <p className={styles.muted}>{member.designation?.title ?? 'No designation'}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
