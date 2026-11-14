import { FileText, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { FinanceLiveRefresh } from '@/components/finance/FinanceLiveRefresh';
import { QuotationTable } from '@/components/finance/QuotationTable';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId, parsePage } from '@/lib/parseListParams';
import { quotationStatusLabels } from '@/lib/validation/financeSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { listFinanceClientOptions } from '@/server/services/financeService';
import { listQuotations, quotationsPerPage, type QuotationFilter } from '@/server/services/quotationService';

export const metadata: Metadata = { title: 'Quotations' };

const statusOptions = [
  ...Object.entries(quotationStatusLabels).map(([value, label]) => ({ value, label })),
  { value: 'expired', label: 'Expired' },
];

type QuotationsPageProps = {
  searchParams: Promise<{ search?: string; status?: string; clientId?: string; page?: string }>;
};

export default async function QuotationsPage({ searchParams }: QuotationsPageProps) {
  const access = await requirePagePermission(permissionKeys.quotationsView);
  const params = await searchParams;
  const status = statusOptions.some((option) => option.value === params.status) ? (params.status as QuotationFilter) : undefined;
  const clientId = parseId(params.clientId);
  const page = parsePage(params.page);

  const [{ quotations, total }, clients] = await Promise.all([
    listQuotations({ search: params.search, status, clientId, page }),
    listFinanceClientOptions(),
  ]);

  const canCreate = access.permissions[permissionKeys.quotationsManage] !== undefined;
  const isFiltered = Boolean(params.search || status || clientId);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    if (clientId) query.set('clientId', clientId);
    return `/quotations?${query.toString()}`;
  }

  return (
    <>
      <FinanceLiveRefresh table="quotations" />
      <PageHeader
        title="Quotations"
        description="Price work for a client, send it, and turn it into an invoice once they accept."
        actions={
          canCreate && (
            <ButtonLink href="/quotations/new" variant="primary">
              <Plus size={16} aria-hidden="true" />
              New quotation
            </ButtonLink>
          )
        }
      />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Title, number or client" defaultValue={params.search} />
        <SelectField label="Status" name="status" options={statusOptions} placeholder="Any status" defaultValue={status} />
        <SelectField
          label="Client"
          name="clientId"
          options={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          placeholder="Any client"
          defaultValue={clientId}
        />
        <div className={filterStyles.actions}>
          <ButtonLink href="/quotations" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {quotations.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={isFiltered ? 'No matching quotations' : 'No quotations yet'}
            description={isFiltered ? 'Try different filters.' : 'Quotations you prepare for clients appear here.'}
          />
        ) : (
          <>
            <QuotationTable quotations={quotations} />
            <PaginationBar page={page} perPage={quotationsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
