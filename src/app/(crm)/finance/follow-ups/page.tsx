import { Download, PhoneCall } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { FollowUpStatusBadge } from '@/components/finance/FollowUpStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { followUpStatuses, followUpStatusLabels } from '@/lib/validation/followUpSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { followUpSorts, followUpsPerPage, getFollowUpBoard, readFollowUpFilters } from '@/server/services/followUpService';

export const metadata: Metadata = { title: 'Payment follow-ups' };

function cleanParams(params: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== 'page'));
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePagePermission(permissionKeys.followupsManage);
  const params = await searchParams;
  const filters = readFollowUpFilters(params);
  const today = todayInIndia();
  const { rows, total, totals } = await getFollowUpBoard(filters, today);

  return (
    <>
      <PageHeader
        title="Payment follow-ups"
        description="Unpaid invoices and where each one stands with the client. You get a reminder on each next follow-up date, and three days before an invoice is due."
        actions={
          <ButtonLink href={`/finance/follow-ups/export?${new URLSearchParams(cleanParams(params))}`} prefetch={false}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </ButtonLink>
        }
      />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Still to collect', value: formatRupees(totals.outstanding) },
            { label: 'Overdue', value: formatRupees(totals.overdue), href: '/finance/follow-ups?due=overdue&sort=overdue-desc' },
            { label: 'Follow-ups due today', value: totals.dueToday, href: '/finance/follow-ups?due=today' },
            { label: 'Promised to pay', value: totals.promised, href: '/finance/follow-ups?status=promise_to_pay' },
          ]}
        />
        <form method="get" className={filterStyles.filters}>
          <TextField label="Search" name="search" type="search" placeholder="Client or invoice number" defaultValue={params.search} />
          <SelectField label="Status" name="status" options={followUpStatuses.map((value) => ({ value, label: followUpStatusLabels[value] }))} placeholder="Any status" defaultValue={filters.status} />
          <SelectField
            label="Show"
            name="due"
            options={[
              { value: 'overdue', label: 'Overdue invoices' },
              { value: 'today', label: 'Follow-ups due today' },
            ]}
            placeholder="All unpaid"
            defaultValue={filters.due}
          />
          <SelectField label="Paid invoices" name="paid" options={[{ value: 'yes', label: 'Include ones followed up' }]} placeholder="Leave out" defaultValue={params.paid} />
          <SelectField label="Sort by" name="sort" options={followUpSorts} defaultValue={filters.sort} />
          <div className={filterStyles.actions}>
            <ButtonLink href="/finance/follow-ups" variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <Panel flush>
          {rows.length === 0 ? (
            <EmptyState icon={PhoneCall} title="Nothing to follow up" description="Issued invoices that are not fully paid appear here." />
          ) : (
            <>
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Invoice</th>
                      <th scope="col">Due</th>
                      <th scope="col">Status</th>
                      <th scope="col">Last follow-up</th>
                      <th scope="col" className={tableStyles.numeric}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.invoice_id}>
                        <td>
                          <Link href={`/finance/follow-ups/${row.invoice_id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                            {row.client_name}
                          </Link>
                          <p className={tableStyles.secondaryText}>
                            {[row.invoice_number, row.title, row.client_manager && `Manager: ${row.client_manager}`].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td>
                          <p>{formatDate(row.due_date)}</p>
                          {row.days_overdue > 0 && row.status !== 'payment_received' && (
                            <p className={tableStyles.secondaryText}>
                              {row.days_overdue} {row.days_overdue === 1 ? 'day' : 'days'} overdue
                            </p>
                          )}
                        </td>
                        <td>
                          <FollowUpStatusBadge status={row.status} />
                          {row.promised_on && row.status === 'promise_to_pay' && <p className={tableStyles.secondaryText}>Promised by {formatDate(row.promised_on)}</p>}
                        </td>
                        <td>
                          {row.last_contacted_on ? (
                            <>
                              <p>{formatDate(row.last_contacted_on)}</p>
                              <p className={tableStyles.secondaryText}>{row.last_note}</p>
                              {row.next_follow_up_on && (
                                <p className={tableStyles.secondaryText}>
                                  Next: {formatDate(row.next_follow_up_on)}
                                  {row.next_follow_up_on <= today ? ' (due)' : ''}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className={tableStyles.secondaryText}>Not yet</span>
                          )}
                        </td>
                        <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={filters.page}
                perPage={followUpsPerPage}
                total={total}
                hrefForPage={(target) => `/finance/follow-ups?${new URLSearchParams({ ...cleanParams(params), page: String(target) })}`}
              />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
