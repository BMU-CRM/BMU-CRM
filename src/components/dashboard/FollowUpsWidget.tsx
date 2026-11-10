import Link from 'next/link';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDate } from '@/lib/formatDate';
import { listDueFollowUps } from '@/server/services/clientService';

export async function FollowUpsWidget() {
  const followUps = await listDueFollowUps(6);

  return (
    <Panel title="Client follow-ups" description="Due today or earlier" flush>
      {followUps.length === 0 ? (
        <p className={layout.emptyText}>No follow-ups due.</p>
      ) : (
        <ul className={layout.list}>
          {followUps.map((client) => (
            <li key={client.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/clients/${client.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {client.company_name}
                </Link>
                <p className={layout.muted}>{formatDate(client.next_follow_up_date)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
