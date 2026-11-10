import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkedFilesPanel } from '@/components/files/LinkedFilesPanel';
import taskPanelStyles from '@/components/tasks/TaskPanels.module.css';
import { PriorityBadge } from '@/components/tasks/TaskBadges';
import { TicketStatusBadge } from '@/components/tickets/TicketBadges';
import { TicketHandlingForm } from '@/components/tickets/TicketForms';
import { TicketLiveRefresh } from '@/components/tickets/TicketLiveRefresh';
import { TicketStatusActions, type TicketMove } from '@/components/tickets/TicketStatusActions';
import { TextAreaField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import type { TicketStatus } from '@/lib/validation/ticketSchema';
import { addTicketCommentAction } from '@/server/actions/ticketActions';
import { requirePagePermission, type CurrentAccess } from '@/server/services/accessService';
import { listLinkedFiles } from '@/server/services/fileService';
import { canHandleTicket, getTicket, listTicketComments, listTicketHandlers, type TicketDetails } from '@/server/services/ticketService';

export const metadata: Metadata = { title: 'Ticket' };

// The moves offered match the rules in guard_ticket_update, which has the final say.
function availableMoves(ticket: TicketDetails, isHandler: boolean, isRequester: boolean) {
  const moves = new Map<TicketStatus, TicketMove>();
  const status = ticket.status;

  if (isHandler) {
    if (status === 'open' || status === 'assigned' || status === 'waiting_for_response') {
      moves.set('in_progress', { status: 'in_progress', label: status === 'waiting_for_response' ? 'Resume work' : 'Start work', variant: 'secondary' });
    }
    if (status === 'in_progress') {
      moves.set('waiting_for_response', { status: 'waiting_for_response', label: 'Ask for more information', variant: 'secondary' });
    }
    if (status === 'resolved') moves.set('closed', { status: 'closed', label: 'Close', variant: 'secondary' });
  }
  if (isRequester && status === 'resolved') {
    moves.set('closed', { status: 'closed', label: 'It is fixed', variant: 'primary' });
    moves.set('open', { status: 'open', label: 'Still a problem', variant: 'secondary' });
  }
  if ((isHandler || isRequester) && status === 'closed') {
    moves.set('open', { status: 'open', label: 'Reopen', variant: 'secondary' });
  }

  return {
    moves: [...moves.values()],
    canResolve: isHandler && status !== 'resolved' && status !== 'closed',
  };
}

async function handlerOptions(access: CurrentAccess, ticket: TicketDetails) {
  const handlers = await listTicketHandlers(access, ticket);
  return handlers.map((person) => ({ value: person.id, label: person.full_name }));
}

type TicketPageProps = {
  params: Promise<{ ticketId: string }>;
};

export default async function TicketPage({ params }: TicketPageProps) {
  const access = await requirePagePermission(permissionKeys.ticketsCreate);
  const ticketId = parseId((await params).ticketId);
  if (!ticketId) notFound();

  const ticket = await getTicket(ticketId);
  if (!ticket) notFound();

  const isRequester = ticket.requester_id === access.employee.id;
  const isHandler = canHandleTicket(access, ticket);
  const [comments, files, handlers] = await Promise.all([
    listTicketComments(ticketId),
    listLinkedFiles({ ticketId }),
    isHandler ? handlerOptions(access, ticket) : Promise.resolve([]),
  ]);
  const { moves, canResolve } = availableMoves(ticket, isHandler, isRequester);
  const isWaitingOnMe = isRequester && ticket.status === 'waiting_for_response';

  return (
    <>
      <TicketLiveRefresh ticketId={ticket.id} />
      <PageHeader
        title={ticket.title}
        description={`${ticket.ticket_code} · ${ticket.category?.name ?? 'Support'} · raised ${formatDateTime(ticket.created_at)}`}
        actions={<TicketStatusActions ticketId={ticket.id} moves={moves} canResolve={canResolve} />}
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel>
            <div className={layout.badges}>
              <TicketStatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <p className={`${layout.text} ${layout.spaced}`}>{ticket.description}</p>
          </Panel>
          {ticket.resolution && (
            <Panel title="Resolution" description={ticket.resolved_at ? `Resolved ${formatDateTime(ticket.resolved_at)}` : undefined}>
              <p className={layout.text}>{ticket.resolution}</p>
            </Panel>
          )}
          <Panel
            title="Conversation"
            description={isWaitingOnMe ? 'The support team needs more information. Reply below to send it back to them.' : undefined}
            flush
          >
            {comments.length === 0 ? (
              <p className={layout.emptyText}>No replies yet.</p>
            ) : (
              <ul className={layout.list}>
                {comments.map((comment) => (
                  <li key={comment.id} className={taskPanelStyles.comment}>
                    <PersonAvatar name={comment.author?.full_name ?? '?'} size="small" />
                    <div className={layout.rowMain}>
                      <p>
                        <span className={layout.rowTitle}>{comment.author?.full_name ?? 'Former employee'}</span>{' '}
                        <span className={layout.muted}>{formatDateTime(comment.created_at)}</span>
                      </p>
                      <p className={layout.text}>{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={layout.sectionForm}>
              <InlineActionForm action={addTicketCommentAction.bind(null, ticket.id)} submitLabel="Send reply">
                <TextAreaField label="Reply" name="body" rows={2} required />
              </InlineActionForm>
            </div>
          </Panel>
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Raised by</dt>
                <dd>
                  {ticket.requester?.full_name ?? 'Former employee'}
                  {ticket.requesterDepartment ? `, ${ticket.requesterDepartment.name}` : ''}
                </dd>
              </div>
              <div>
                <dt>Handled by</dt>
                <dd>
                  {ticket.assignee?.full_name ?? 'Not assigned yet'}
                  {ticket.handlingDepartment ? ` (${ticket.handlingDepartment.name})` : ''}
                </dd>
              </div>
              {ticket.closed_at && (
                <div>
                  <dt>Closed</dt>
                  <dd>{formatDateTime(ticket.closed_at)}</dd>
                </div>
              )}
            </dl>
          </Panel>
          {isHandler && (
            <Panel title="Handling">
              <TicketHandlingForm ticketId={ticket.id} assignedTo={ticket.assigned_to} priority={ticket.priority} handlers={handlers} />
            </Panel>
          )}
          <LinkedFilesPanel
            title="Attachments"
            files={files}
            links={{ ticketId: ticket.id }}
            canUpload={access.permissions[permissionKeys.filesUpload] !== undefined}
          />
        </div>
      </div>
    </>
  );
}
