import { DoorOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { BarChart } from '@/components/charts/BarChart';
import { ResignationStatusBadge } from '@/components/exits/ResignationStatusBadge';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { resignationStatusLabels } from '@/lib/validation/exitSchema';
import { requireAccess } from '@/server/services/accessService';
import { getAttrition, listResignations, resignationsPerPage } from '@/server/services/exitService';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Exits' };

type ExitsPageProps = {
  searchParams: Promise<{ view?: string; search?: string; status?: string; sort?: string; year?: string; page?: string }>;
};

export default async function ExitsPage({ searchParams }: ExitsPageProps) {
  const access = await requireAccess();
  const canManage = access.permissions[permissionKeys.exitsManage] !== undefined;
  // Finance opens exits to pay settlements.
  if (!canManage && access.permissions[permissionKeys.payrollApprove] === undefined) notFound();

  const params = await searchParams;
  const view = params.view === 'attrition' && canManage ? 'attrition' : 'list';
  const thisYear = Number(todayInIndia().slice(0, 4));

  return (
    <>
      <PageHeader title="Exits" description="Resignations, exit checklists and full and final settlements." />
      {canManage && (
        <PageTabs
          label="Exits"
          tabs={[
            { href: '/hr/exits', label: 'Resignations', current: view === 'list' },
            { href: '/hr/exits?view=attrition', label: 'Attrition', current: view === 'attrition' },
          ]}
        />
      )}
      {view === 'attrition' ? (
        <AttritionView year={params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : thisYear} />
      ) : (
        <ResignationList params={params} />
      )}
    </>
  );
}

async function ResignationList({ params }: { params: Awaited<ExitsPageProps['searchParams']> }) {
  const status = Object.keys(resignationStatusLabels).find((key) => key === params.status);
  const sort = params.sort === 'last-day' ? 'last-day' : 'newest';
  const page = parsePage(params.page);
  const { resignations, total } = await listResignations({ search: params.search, status, sort, page });
  const isFiltered = Boolean(params.search || status);

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (status) query.set('status', status);
    query.set('sort', sort);
    query.set('page', String(target));
    return `/hr/exits?${query.toString()}`;
  }

  return (
    <>
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Employee name" defaultValue={params.search} />
        <SelectField label="Status" name="status" options={Object.entries(resignationStatusLabels).map(([value, label]) => ({ value, label }))} placeholder="Any status" defaultValue={status} />
        <SelectField
          label="Sort by"
          name="sort"
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'last-day', label: 'Last working day' },
          ]}
          defaultValue={sort}
        />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/hr/exits" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {resignations.length === 0 ? (
          <EmptyState icon={DoorOpen} title={isFiltered ? 'No matching resignations' : 'No resignations'} description={isFiltered ? 'Try different filters.' : 'Resignations appear here when people submit them.'} />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Last working day</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resignations.map((resignation) => (
                    <tr key={resignation.id}>
                      <td>
                        <Link href={`/hr/exits/${resignation.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {resignation.employee?.full_name}
                        </Link>
                        <p className={tableStyles.secondaryText}>
                          {[resignation.employee?.employee_code, resignation.employee?.department?.name].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td>{formatDate(resignation.submitted_on)}</td>
                      <td>{resignation.last_working_day ? formatDate(resignation.last_working_day) : resignation.proposed_last_day ? `Proposed ${formatDate(resignation.proposed_last_day)}` : '—'}</td>
                      <td>
                        <ResignationStatusBadge status={resignation.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} perPage={resignationsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}

async function AttritionView({ year }: { year: number }) {
  const months = await getAttrition(year);
  const exits = months.reduce((sum, month) => sum + month.exits, 0);
  const averageHeadcount = months.reduce((sum, month) => sum + month.headcount, 0) / 12;
  const rate = averageHeadcount > 0 ? Math.round((exits / averageHeadcount) * 1000) / 10 : 0;

  return (
    <div className={layout.stack}>
      <form method="get" className={filterStyles.filters}>
        <input type="hidden" name="view" value="attrition" />
        <TextField label="Year" name="year" type="number" min={2000} max={2200} defaultValue={year} />
        <div className={filterStyles.actions}>
          <Button type="submit">Show</Button>
        </div>
      </form>
      <StatTiles
        tiles={[
          { label: `People who left in ${year}`, value: exits },
          { label: 'Average headcount', value: Math.round(averageHeadcount) },
          { label: 'Attrition rate', value: `${rate}%` },
        ]}
      />
      <Panel title="Leavers by month" description="By last working day. Attrition is leavers over headcount at the month's end.">
        <BarChart
          label={`People who left each month of ${year}`}
          orientation="vertical"
          data={months.map((month) => ({ label: formatPayrollMonth(`${month.month}-01`).slice(0, 3), value: month.exits }))}
          valueHeading="Leavers"
        />
      </Panel>
      <Panel flush>
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className={tableStyles.numeric}>Headcount at month end</th>
                <th scope="col" className={tableStyles.numeric}>Leavers</th>
                <th scope="col" className={tableStyles.numeric}>Attrition</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month}>
                  <td>{formatPayrollMonth(`${month.month}-01`)}</td>
                  <td className={tableStyles.numeric}>{month.headcount}</td>
                  <td className={tableStyles.numeric}>{month.exits}</td>
                  <td className={tableStyles.numeric}>{month.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
