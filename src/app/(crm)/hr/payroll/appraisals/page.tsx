import { Plus, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PayrollTabs } from '@/components/payroll/PayrollTabs';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateRange } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { appraisalsPerPage, listAppraisals } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Appraisals' };

export default async function AppraisalsPage({ searchParams }: { searchParams: Promise<{ search?: string; year?: string; page?: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const params = await searchParams;
  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : undefined;
  const page = parsePage(params.page);
  const { appraisals, total } = await listAppraisals({ search: params.search, year, page });

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (year) query.set('year', String(year));
    query.set('page', String(target));
    return `/hr/payroll/appraisals?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Performance ratings, newest first. Each person sees their own."
        actions={
          <ButtonLink href="/hr/payroll/appraisals/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            Add appraisal
          </ButtonLink>
        }
      />
      <PayrollTabs current="appraisals" />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Employee name" defaultValue={params.search} />
        <TextField label="Period ending in" name="year" type="number" min={2000} max={2200} defaultValue={year} />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/hr/payroll/appraisals" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {appraisals.length === 0 ? (
          <EmptyState icon={Star} title={params.search || year ? 'No matching appraisals' : 'No appraisals yet'} description="Record one after each review." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Period</th>
                    <th scope="col" className={tableStyles.numeric}>Rating</th>
                    <th scope="col">Reviewed by</th>
                  </tr>
                </thead>
                <tbody>
                  {appraisals.map((appraisal) => (
                    <tr key={appraisal.id}>
                      <td>
                        <Link href={`/hr/payroll/appraisals/${appraisal.id}/edit`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {appraisal.employee?.full_name}
                        </Link>
                        <p className={tableStyles.secondaryText}>{appraisal.employee?.department?.name ?? 'No department'}</p>
                      </td>
                      <td>
                        <p>{appraisal.period_label}</p>
                        <p className={tableStyles.secondaryText}>{formatDateRange(appraisal.period_start, appraisal.period_end)}</p>
                      </td>
                      <td className={tableStyles.numeric}>{appraisal.rating} of 5</td>
                      <td>{appraisal.reviewer?.full_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} perPage={appraisalsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
