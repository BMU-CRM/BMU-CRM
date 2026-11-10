import { Pencil, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientRecordsPanel, ClientServicesPanel, ClientTimelinePanel } from '@/components/clients/ClientPanels';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { InvoiceTable } from '@/components/finance/InvoiceTable';
import { QuotationTable } from '@/components/finance/QuotationTable';
import { LinkedFilesPanel } from '@/components/files/LinkedFilesPanel';
import { ProjectTable } from '@/components/projects/ProjectTable';
import { TaskTable } from '@/components/tasks/TaskTable';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { safeExternalUrl } from '@/lib/safeExternalUrl';
import { requirePagePermission } from '@/server/services/accessService';
import {
  canUpdateClient,
  getClient,
  getClientTimeline,
  listClientRecords,
  listClientServices,
} from '@/server/services/clientService';
import { listServiceOptions } from '@/server/services/catalogService';
import { listLinkedFiles } from '@/server/services/fileService';
import { canSeeInvoices, canSeeQuotations, hasFinanceReach } from '@/server/services/financeService';
import { getClientBalance, listClientInvoices } from '@/server/services/invoiceService';
import { listClientMeetings } from '@/server/services/meetingService';
import { listClientQuotations } from '@/server/services/quotationService';
import { listProjects } from '@/server/services/projectService';
import { listTasks } from '@/server/services/taskService';

export const metadata: Metadata = { title: 'Client' };

type ClientPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const access = await requirePagePermission(permissionKeys.clientsView);
  const clientId = parseId((await params).clientId);
  if (!clientId) notFound();

  const client = await getClient(clientId);
  if (!client) notFound();

  const showInvoices = canSeeInvoices(access);
  const showQuotations = canSeeQuotations(access);

  const [canUpdate, records, services, timeline, { projects }, { tasks, total: taskTotal }, files, meetings, invoices, quotations, balance] =
    await Promise.all([
      canUpdateClient(clientId),
      listClientRecords(clientId),
      listClientServices(clientId),
      getClientTimeline(clientId),
      listProjects({ clientId, page: 1 }),
      listTasks(access, { view: 'all', clientId, page: 1 }),
      listLinkedFiles({ clientId }),
      listClientMeetings(clientId, 10),
      showInvoices ? listClientInvoices(clientId, 10) : Promise.resolve([]),
      showQuotations ? listClientQuotations(clientId, 10) : Promise.resolve([]),
      showInvoices ? getClientBalance(clientId) : Promise.resolve(null),
    ]);

  const serviceOptions = canUpdate ? await listServiceOptions() : [];
  const website = safeExternalUrl(client.website);
  const canCreateProject = access.permissions[permissionKeys.projectsCreate] !== undefined;
  const canCreateTask = access.permissions[permissionKeys.tasksCreate] !== undefined;
  const canCreateMeeting = access.permissions[permissionKeys.meetingsCreate] !== undefined;
  const canInvoice = hasFinanceReach(access, permissionKeys.invoicesManage, { client });
  const canQuote = hasFinanceReach(access, permissionKeys.quotationsManage, { client });
  const openFollowUps = records.filter((record) => record.kind === 'follow_up' && !record.completed_at).length;
  const complaints = records.filter((record) => record.kind === 'complaint').length;
  const activeProjects = projects.filter((project) => project.status === 'active' || project.status === 'planning').length;

  return (
    <>
      <PageHeader
        title={client.company_name}
        description={client.client_code}
        actions={
          canUpdate && (
            <ButtonLink href={`/clients/${client.id}/edit`}>
              <Pencil size={16} aria-hidden="true" />
              Edit
            </ButtonLink>
          )
        }
      />

      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Active projects', value: activeProjects },
            { label: 'Tasks', value: taskTotal },
            { label: 'Open follow-ups', value: openFollowUps },
            { label: 'Complaints', value: complaints },
            ...(balance
              ? [
                  { label: 'Owed to us', value: formatRupees(balance.outstanding), href: `/invoices?clientId=${client.id}&status=unpaid` },
                  { label: 'Overdue', value: formatRupees(balance.overdue), href: `/invoices?clientId=${client.id}&status=overdue` },
                ]
              : []),
          ]}
        />

        <div className={layout.columns}>
          <div className={layout.stack}>
            <Panel
              title="Projects"
              action={
                canCreateProject && (
                  <ButtonLink href={`/projects/new?clientId=${client.id}`} variant="ghost">
                    <Plus size={16} aria-hidden="true" />
                    New project
                  </ButtonLink>
                )
              }
              flush
            >
              {projects.length === 0 ? (
                <p className={layout.emptyText}>No projects yet.</p>
              ) : (
                <ProjectTable projects={projects} />
              )}
            </Panel>
            <Panel
              title="Tasks"
              action={
                canCreateTask && (
                  <ButtonLink href={`/tasks/new?clientId=${client.id}`} variant="ghost">
                    <Plus size={16} aria-hidden="true" />
                    New task
                  </ButtonLink>
                )
              }
              flush
            >
              {tasks.length === 0 ? <p className={layout.emptyText}>No tasks yet.</p> : <TaskTable tasks={tasks} />}
            </Panel>
            {showInvoices && (
              <Panel
                title="Invoices"
                action={
                  <div className={layout.rowActions}>
                    {invoices.length > 0 && (
                      <ButtonLink href={`/invoices?clientId=${client.id}`} variant="ghost">
                        All
                      </ButtonLink>
                    )}
                    {canInvoice && (
                      <ButtonLink href={`/invoices/new?clientId=${client.id}`} variant="ghost">
                        <Plus size={16} aria-hidden="true" />
                        New invoice
                      </ButtonLink>
                    )}
                  </div>
                }
                flush
              >
                {invoices.length === 0 ? <p className={layout.emptyText}>No invoices yet.</p> : <InvoiceTable invoices={invoices} showClient={false} />}
              </Panel>
            )}
            {showQuotations && (
              <Panel
                title="Quotations"
                action={
                  <div className={layout.rowActions}>
                    {quotations.length > 0 && (
                      <ButtonLink href={`/quotations?clientId=${client.id}`} variant="ghost">
                        All
                      </ButtonLink>
                    )}
                    {canQuote && (
                      <ButtonLink href={`/quotations/new?clientId=${client.id}`} variant="ghost">
                        <Plus size={16} aria-hidden="true" />
                        New quotation
                      </ButtonLink>
                    )}
                  </div>
                }
                flush
              >
                {quotations.length === 0 ? (
                  <p className={layout.emptyText}>No quotations yet.</p>
                ) : (
                  <QuotationTable quotations={quotations} showClient={false} />
                )}
              </Panel>
            )}
            <Panel
              title="Meetings"
              action={
                canCreateMeeting && (
                  <ButtonLink href={`/meetings/new?clientId=${client.id}`} variant="ghost">
                    <Plus size={16} aria-hidden="true" />
                    New meeting
                  </ButtonLink>
                )
              }
              flush
            >
              {meetings.length === 0 ? (
                <p className={layout.emptyText}>No meetings you can see.</p>
              ) : (
                <ul className={layout.list}>
                  {meetings.map((meeting) => (
                    <li key={meeting.id} className={layout.row}>
                      <div className={layout.rowMain}>
                        <Link href={`/meetings/${meeting.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                          {meeting.title}
                        </Link>
                        <p className={layout.muted}>
                          {formatDateTime(meeting.starts_at)} · {meeting.organizer?.full_name ?? 'Former employee'}
                        </p>
                      </div>
                      {meeting.status !== 'scheduled' && (
                        <StatusBadge tone={meeting.status === 'cancelled' ? 'critical' : 'good'}>
                          {meeting.status === 'cancelled' ? 'Cancelled' : 'Held'}
                        </StatusBadge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <LinkedFilesPanel
              title="Client files"
              files={files}
              links={{ clientId: client.id }}
              canUpload={canUpdate && access.permissions[permissionKeys.filesUpload] !== undefined}
            />
            <ClientRecordsPanel clientId={client.id} records={records} canUpdate={canUpdate} />
            <ClientTimelinePanel entries={timeline} />
          </div>

          <div className={layout.stack}>
            <Panel title="Profile">
              <div className={layout.badges}>
                <ClientStatusBadge status={client.status} />
              </div>
              <dl className={`${layout.factsStacked} ${layout.spaced}`}>
                <div>
                  <dt>Contact person</dt>
                  <dd>{client.contact_person ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{client.email ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{client.phone ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Website</dt>
                  <dd>
                    {website ? (
                      <a href={website} target="_blank" rel="noopener noreferrer" className={layout.link}>
                        {website}
                      </a>
                    ) : (
                      'Not set'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Industry</dt>
                  <dd>{client.industryRef?.name ?? client.industry ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd className={layout.text}>{client.address ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>GSTIN</dt>
                  <dd>{client.gstin ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Billing state</dt>
                  <dd>{client.billing_state ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Client Manager</dt>
                  <dd>{client.manager?.full_name ?? 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Assigned department</dt>
                  <dd>{client.department?.name ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Onboarded</dt>
                  <dd>{formatDate(client.onboarding_date)}</dd>
                </div>
                <div>
                  <dt>Next follow-up</dt>
                  <dd>{formatDate(client.next_follow_up_date)}</dd>
                </div>
              </dl>
            </Panel>
            {client.important_notes && (
              <Panel title="Important notes">
                <p className={layout.text}>{client.important_notes}</p>
              </Panel>
            )}
            <ClientServicesPanel clientId={client.id} services={services} serviceOptions={serviceOptions} canUpdate={canUpdate} />
          </div>
        </div>
      </div>
    </>
  );
}
