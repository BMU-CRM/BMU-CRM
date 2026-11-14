import { Plus, Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { ReimbursementStatusBadge } from '@/components/reimbursements/ReimbursementStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { reimbursementStatusLabels, reimbursementStatuses } from '@/lib/validation/reimbursementSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { getMyClaimTotals, listMyReimbursements, reimbursementsPerPage } from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'Reimbursements' };

export default async function ReimbursementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const access = await requirePagePermission(permissionKeys.reimbursementsSubmit);
  const params = await searchParams;
  const status = reimbursementStatuses.find((value) => value === params.status);
  const page = parsePage(params.page);
  const [{ claims, total }, totals] = await Promise.all([listMyReimbursements(access, { status, page }), getMyClaimTotals(access)]);

  return (
    <>
      <PageHeader
        title="Reimbursements"
        description="Claim back money you spent for work. Your manager or HR approves it, then Finance pays you."
        actions={
          <ButtonLink href="/reimbursements/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            New claim
          </ButtonLink>
        }
      />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Waiting for approval', value: formatRupees(totals.waiting) },
            { label: 'Approved, to be paid', value: formatRupees(totals.toBePaid) },
            { label: 'Paid to you', value: formatRupees(totals.paid) },
          ]}
        />
        <form method="get" className={filterStyles.filters}>
          <SelectField label="Status" name="status" options={reimbursementStatuses.map((value) => ({ value, label: reimbursementStatusLabels[value] }))} placeholder="Any status" defaultValue={status} />
          <div className={filterStyles.actions}>
            <ButtonLink href="/reimbursements" variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <Panel flush>
          {claims.length === 0 ? (
            <EmptyState icon={Receipt} title="No claims here" description="Claims you submit appear here with where they stand." />
          ) : (
            <>
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Claim</th>
                      <th scope="col">Spent on</th>
                      <th scope="col">Status</th>
                      <th scope="col" className={tableStyles.numeric}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => (
                      <tr key={claim.id}>
                        <td>
                          <Link href={`/reimbursements/${claim.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                            {claim.category?.name}
                          </Link>
                          <p className={tableStyles.secondaryText}>{claim.description}</p>
                        </td>
                        <td>{formatDate(claim.expense_date)}</td>
                        <td>
                          <ReimbursementStatusBadge status={claim.status} />
                        </td>
                        <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(claim.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={page}
                perPage={reimbursementsPerPage}
                total={total}
                hrefForPage={(target) => `/reimbursements?${new URLSearchParams({ ...(status ? { status } : {}), page: String(target) })}`}
              />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
