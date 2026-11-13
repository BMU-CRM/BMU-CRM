import { AppLink as Link } from '@/components/ui/AppLink';
import { TicketStatusBadge } from '@/components/tickets/TicketBadges';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDateTime } from '@/lib/formatDate';
import type { CurrentAccess } from '@/server/services/accessService';
import { listTicketsToHandle } from '@/server/services/ticketService';

// Tickets given to this person, and unassigned ones they can pick up.
export async function TicketsToHandleWidget({ access }: { access: CurrentAccess }) {
  const tickets = await listTicketsToHandle(access, 5);

  return (
    <Panel title="Support tickets" action={<ButtonLink href="/tickets?view=queue" variant="ghost">Queue</ButtonLink>} flush>
      {tickets.length === 0 ? (
        <p className={layout.emptyText}>No tickets waiting.</p>
      ) : (
        <ul className={layout.list}>
          {tickets.map((ticket) => (
            <li key={ticket.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/tickets/${ticket.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {ticket.title}
                </Link>
                <p className={layout.muted}>
                  {ticket.ticket_code} · {ticket.requester?.full_name ?? 'Former employee'} · {formatDateTime(ticket.created_at)}
                </p>
              </div>
              <TicketStatusBadge status={ticket.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
