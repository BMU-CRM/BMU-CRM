import { Plus, ReceiptIndianRupee } from 'lucide-react';
import type { Metadata } from 'next';
import { FinanceLiveRefresh } from '@/components/finance/FinanceLiveRefresh';
import { InvoiceTable } from '@/components/finance/InvoiceTable';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId, parsePage } from '@/lib/parseListParams';
import { invoiceStatusLabels } from '@/lib/validation/financeSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { listFinanceClientOptions } from '@/server/services/financeService';
import { invoicesPerPage, listInvoices, type InvoiceFilter } from '@/server/services/invoiceService';

export const metadata: Metadata = { title: 'Invoices' };

const statusOptions = [
  { value: 'unpaid', label: 'Not fully paid' },
  { value: 'overdue', label: 'Overdue' },
  ...Object.entries(invoiceStatusLabels).map(([value, label]) => ({ value, label })),
];

type InvoicesPageProps = {
  searchParams: Promise<{ search?: string; status?: string; clientId?: string; page?: string }>;
};

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const access = await requirePagePermission(permissionKeys.invoicesView);
  const params = await searchParams;
  const status = statusOptions.some((option) => option.value === params.status) ? (params.status as InvoiceFilter) : undefined;
  const clientId = parseId(params.clientId);
  const page = parsePage(params.page);

  const [{ invoices, total }, clients] = await Promise.all([
    listInvoices({ search: params.search, status, clientId, page }),
    listFinanceClientOptions(),
  ]);

  const canCreate = access.permissions[permissionKeys.invoicesManage] !== undefined;
  const isFiltered = Boolean(params.search || status || clientId);

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ page: String(target) });
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    if (clientId) query.set('clientId', clientId);
    return `/invoices?${query.toString()}`;
  }

  return (
    <>
      <FinanceLiveRefresh table="invoices" />
      <PageHeader
        title="Invoices"
        description="GST invoices, what each client has paid, and what is still owed."
        actions={
          canCreate && (
            <ButtonLink href="/invoices/new" variant="primary">
              <Plus size={16} aria-hidden="true" />
              New invoice
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
          <Button type="submit">Apply</Button>
          <ButtonLink href="/invoices" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptIndianRupee}
            title={isFiltered ? 'No matching invoices' : 'No invoices yet'}
            description={isFiltered ? 'Try different filters.' : 'Invoices appear here once they are drafted, or created from an accepted quotation.'}
          />
        ) : (
          <>
            <InvoiceTable invoices={invoices} />
            <PaginationBar page={page} perPage={invoicesPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
