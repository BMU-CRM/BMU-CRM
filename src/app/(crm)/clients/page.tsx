import { Handshake, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ClientFilters } from '@/components/clients/ClientFilters';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import styles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { clientStatusLabels, type ClientStatus } from '@/lib/validation/clientSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { clientsPerPage, listClients } from '@/server/services/clientService';
import { listIndustryOptions, listServiceGroupOptions, listServiceOptions } from '@/server/services/catalogService';
import { listEmployeeOptions } from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'Clients' };

type ClientsPageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    managerId?: string;
    industryId?: string;
    serviceGroupId?: string;
    serviceId?: string;
    page?: string;
  }>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const access = await requirePagePermission(permissionKeys.clientsView);
  const params = await searchParams;

  const status = params.status && params.status in clientStatusLabels ? (params.status as ClientStatus) : undefined;
  const managerId = parseId(params.managerId);
  const industryId = parseId(params.industryId);
  const serviceGroupId = parseId(params.serviceGroupId);
  const serviceId = parseId(params.serviceId);
  const page = parsePage(params.page);

  const [{ clients, total }, managers, industries, serviceGroups, services] = await Promise.all([
    listClients({ search: params.search, status, managerId, industryId, serviceGroupId, serviceId, page }),
    listEmployeeOptions(),
    listIndustryOptions(),
    listServiceGroupOptions(),
    listServiceOptions(),
  ]);

  const canCreate = access.permissions[permissionKeys.clientsCreate] !== undefined;
  const isFiltered = Boolean(params.search || status || managerId || industryId || serviceGroupId || serviceId);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    if (managerId) query.set('managerId', managerId);
    if (industryId) query.set('industryId', industryId);
    if (serviceGroupId) query.set('serviceGroupId', serviceGroupId);
    if (serviceId) query.set('serviceId', serviceId);
    return `/clients?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${total} ${total === 1 ? 'client' : 'clients'}`}
        actions={
          canCreate && (
            <ButtonLink href="/clients/new" variant="primary">
              <Plus size={16} aria-hidden="true" />
              Add client
            </ButtonLink>
          )
        }
      />
      <ClientFilters
        managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
        industries={industries}
        services={serviceGroups}
        subServices={[...services].sort((first, second) => first.label.localeCompare(second.label))}
        values={{ search: params.search, status, managerId, industryId, serviceGroupId, serviceId }}
      />
      <Panel flush>
        {clients.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title={isFiltered ? 'No matching clients' : 'No clients yet'}
            description={isFiltered ? 'Try different filters.' : 'Clients and leads appear here once they are added.'}
          />
        ) : (
          <>
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Client Manager</th>
                    <th scope="col">Status</th>
                    <th scope="col">Next follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <Link href={`/clients/${client.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                          {client.company_name}
                        </Link>
                        <p className={styles.secondaryText}>
                          {[client.client_code, client.industryRef?.name ?? client.industry].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td>
                        {client.contact_person ?? '—'}
                        {client.email && <p className={styles.secondaryText}>{client.email}</p>}
                      </td>
                      <td>{client.manager?.full_name ?? '—'}</td>
                      <td>
                        <ClientStatusBadge status={client.status} />
                      </td>
                      <td>{client.next_follow_up_date ? formatDate(client.next_follow_up_date) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} perPage={clientsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
