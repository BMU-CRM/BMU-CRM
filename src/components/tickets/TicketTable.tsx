import { AppLink as Link } from '@/components/ui/AppLink';
import { PriorityBadge } from '@/components/tasks/TaskBadges';
import styles from '@/components/ui/DataTable.module.css';
import { formatDateTime } from '@/lib/formatDate';
import type { TicketListItem } from '@/server/services/ticketService';
import { TicketStatusBadge } from './TicketBadges';

export function TicketTable({ tickets, showRequester }: { tickets: TicketListItem[]; showRequester: boolean }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Ticket</th>
            {showRequester && <th scope="col">Raised by</th>}
            <th scope="col">Handled by</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Raised</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <Link href={`/tickets/${ticket.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                  {ticket.title}
                </Link>
                <p className={styles.secondaryText}>
                  {ticket.ticket_code} · {ticket.category?.name}
                </p>
              </td>
              {showRequester && <td>{ticket.requester?.full_name ?? 'Former employee'}</td>}
              <td>{ticket.assignee?.full_name ?? 'Not assigned yet'}</td>
              <td>
                <TicketStatusBadge status={ticket.status} />
              </td>
              <td>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td>{formatDateTime(ticket.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
