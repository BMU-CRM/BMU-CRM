import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { PayrollTabs } from '@/components/payroll/PayrollTabs';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listDepartments } from '@/server/services/organisationService';
import { listCurrentStructures } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Salary structures' };

const perPage = 25;

type StructuresPageProps = {
  searchParams: Promise<{ search?: string; departmentId?: string; show?: string; sort?: string; page?: string }>;
};

export default async function SalaryStructuresPage({ searchParams }: StructuresPageProps) {
  await requirePagePermission(permissionKeys.payrollManage);
  const params = await searchParams;
  const departmentId = parseId(params.departmentId);
  const missingOnly = params.show === 'missing';
  const sort = params.sort === 'gross-desc' ? 'gross-desc' : 'name';
  const page = parsePage(params.page);

  const [allRows, departments] = await Promise.all([
    listCurrentStructures({ search: params.search, departmentId, missingOnly }),
    listDepartments(),
  ]);
  const rows = sort === 'gross-desc' ? [...allRows].sort((a, b) => (b.structure?.gross ?? -1) - (a.structure?.gross ?? -1)) : allRows;
  const missing = allRows.filter((row) => !row.structure).length;

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (departmentId) query.set('departmentId', departmentId);
    if (missingOnly) query.set('show', 'missing');
    query.set('sort', sort);
    query.set('page', String(target));
    return `/hr/payroll/structures?${query.toString()}`;
  }

  return (
    <>
      <PageHeader title="Payroll" description="Each person's salary in force today. A change is a new structure from a new date, so history is kept." />
      <PayrollTabs current="structures" />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Name or employee ID" defaultValue={params.search} />
        <SelectField
          label="Department"
          name="departmentId"
          options={departments.map((department) => ({ value: department.id, label: department.name }))}
          placeholder="All departments"
          defaultValue={departmentId}
        />
        <SelectField label="Show" name="show" options={[{ value: 'missing', label: 'Only people without a salary' }]} placeholder="Everyone" defaultValue={params.show} />
        <SelectField
          label="Sort by"
          name="sort"
          options={[
            { value: 'name', label: 'Name' },
            { value: 'gross-desc', label: 'Highest gross' },
          ]}
          defaultValue={sort}
        />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/hr/payroll/structures" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel description={missing > 0 && !missingOnly ? `${missing} ${missing === 1 ? 'person has' : 'people have'} no salary yet, so they are left off payroll.` : undefined} flush>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No matching people" description="Try different filters." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">In force since</th>
                    <th scope="col" className={tableStyles.numeric}>Monthly gross</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice((page - 1) * perPage, page * perPage).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/hr/payroll/structures/${row.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {row.full_name}
                        </Link>
                        <p className={tableStyles.secondaryText}>
                          {[row.employee_code, row.department?.name, row.designation?.title].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td>{row.structure ? formatDate(row.structure.effective_from) : <StatusBadge tone="warning">No salary set</StatusBadge>}</td>
                      <td className={tableStyles.numeric}>{row.structure ? formatRupees(row.structure.gross) : '—'}</td>
                      <td>
                        <div className={tableStyles.rowActions}>
                          <ButtonLink href={`/hr/payroll/structures/${row.id}/new`} variant="ghost">
                            {row.structure ? 'Revise' : 'Set salary'}
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} perPage={perPage} total={rows.length} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
