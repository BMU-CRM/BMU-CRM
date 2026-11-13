import { FileSpreadsheet } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { Button, ButtonLink } from '@/components/ui/Button';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { requirePagePermission } from '@/server/services/accessService';
import { listMyPayslips } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'My payslips' };

const perPage = 12;

export default async function MyPayslipsPage({ searchParams }: { searchParams: Promise<{ year?: string; page?: string }> }) {
  const access = await requirePagePermission(permissionKeys.payslipsView);
  const params = await searchParams;
  const year = params.year && /^\d{4}$/.test(params.year) ? params.year : undefined;
  const page = parsePage(params.page);

  const all = (await listMyPayslips(access)).filter((slip) => !year || slip.run?.month.startsWith(year));
  const payslips = all.slice((page - 1) * perPage, page * perPage);

  return (
    <>
      <PageHeader title="My payslips" description="Each payslip appears once that month's salary is paid." />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Year" name="year" type="number" min={2000} max={2200} defaultValue={year} />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/payslips" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {payslips.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title={year ? `No payslips in ${year}` : 'No payslips yet'} description="They appear here after payroll is paid." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col" className={tableStyles.numeric}>Paid days</th>
                    <th scope="col" className={tableStyles.numeric}>Gross</th>
                    <th scope="col" className={tableStyles.numeric}>Deductions</th>
                    <th scope="col" className={tableStyles.numeric}>Net pay</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((slip) => (
                    <tr key={slip.id}>
                      <td>
                        <Link href={`/payslips/${slip.id}/print`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {slip.run ? formatPayrollMonth(slip.run.month) : 'Payslip'}
                        </Link>
                        {slip.run?.paid_on && <p className={tableStyles.secondaryText}>Paid {formatDate(slip.run.paid_on)}</p>}
                      </td>
                      <td className={tableStyles.numeric}>{slip.paid_days}</td>
                      <td className={tableStyles.numeric}>{formatRupees(slip.gross_earnings)}</td>
                      <td className={tableStyles.numeric}>{formatRupees(slip.total_deductions)}</td>
                      <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(slip.net_pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} perPage={perPage} total={all.length} hrefForPage={(target) => `/payslips?${new URLSearchParams({ ...(year ? { year } : {}), page: String(target) })}`} />
          </>
        )}
      </Panel>
    </>
  );
}
