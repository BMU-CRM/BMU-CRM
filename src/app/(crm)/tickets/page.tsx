import { LifeBuoy, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import taskTabs from '@/components/tasks/TaskViewTabs.module.css';
import { TicketLiveRefresh } from '@/components/tickets/TicketLiveRefresh';
import { TicketTable } from '@/components/tickets/TicketTable';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parsePage } from '@/lib/parseListParams';
import { ticketStatusLabels, type TicketStatus } from '@/lib/validation/ticketSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { countTicketsToHandle, listTickets, ticketsPerPage, ticketViews, type TicketView } from '@/server/services/ticketService';

export const metadata: Metadata = { title: 'Support' };

const statusOptions = Object.entries(ticketStatusLabels).map(([value, label]) => ({ value, label }));

const emptyMessages: Record<TicketView, { title: string; description: string }> = {
  mine: { title: 'No tickets yet', description: 'When you need help from IT, HR, finance or the office, raise a ticket here.' },
  assigned: { title: 'Nothing assigned to you', description: 'Tickets given to you to handle appear here.' },
  queue: { title: 'The queue is clear', description: 'Open tickets for your team appear here.' },
};

type TicketsPageProps = {
  searchParams: Promise<{ view?: string; search?: string; status?: string; page?: string }>;
};

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const access = await requirePagePermission(permissionKeys.ticketsCreate);
  const params = await searchParams;
  const canHandle = access.permissions[permissionKeys.ticketsManage] !== undefined;

  const requested = ticketViews.find((option) => option === params.view) ?? 'mine';
  const view: TicketView = canHandle ? requested : 'mine';
  const status = params.status && params.status in ticketStatusLabels ? (params.status as TicketStatus) : undefined;
  const page = parsePage(params.page);

  const [{ tickets, total }, counts] = await Promise.all([
    listTickets(access, { view, search: params.search, status, page }),
    countTicketsToHandle(access),
  ]);

  const tabs: { view: TicketView; label: string; count?: number }[] = [
    { view: 'mine', label: 'My tickets' },
    ...(canHandle
      ? [
          { view: 'assigned' as const, label: 'Assigned to me', count: counts.assigned },
          { view: 'queue' as const, label: 'Support queue', count: counts.unassigned },
        ]
      : []),
  ];

  const isFiltered = Boolean(params.search || status);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ view, page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    return `/tickets?${query.toString()}`;
  }

  return (
    <>
      <TicketLiveRefresh />
      <PageHeader
        title="Support"
        description="Ask for help, and follow your requests until they are fixed."
        actions={
          <ButtonLink href="/tickets/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            Raise a ticket
          </ButtonLink>
        }
      />
      {tabs.length > 1 && (
        <nav className={taskTabs.tabs} aria-label="Ticket views">
          {tabs.map((tab) => (
            <Link key={tab.view} href={`/tickets?view=${tab.view}`} className={taskTabs.tab} aria-current={tab.view === view ? 'page' : undefined}>
              {tab.label}
              {tab.count ? <span className={taskTabs.count}>{tab.count}</span> : null}
            </Link>
          ))}
        </nav>
      )}
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value={view} />
        <TextField label="Search" name="search" type="search" placeholder="Summary or ticket ID" defaultValue={params.search} />
        <SelectField
          label="Status"
          name="status"
          options={statusOptions}
          placeholder={view === 'mine' ? 'Any status' : 'Still open'}
          defaultValue={status}
        />
        <div className={filterStyles.actions}>
          <ButtonLink href={`/tickets?view=${view}`} variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title={isFiltered ? 'No matching tickets' : emptyMessages[view].title}
            description={isFiltered ? 'Try different filters.' : emptyMessages[view].description}
          />
        ) : (
          <>
            <TicketTable tickets={tickets} showRequester={view !== 'mine'} />
            <PaginationBar page={page} perPage={ticketsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
