import { ChartColumn } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
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
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { todayInIndia } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { carryForwardLeaveAction } from '@/server/actions/hrActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getLeaveUtilisation, listLeaveTypes } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'Leave report' };

const perPage = 25;
const sorts = [
  { value: 'name', label: 'Name' },
  { value: 'used', label: 'Most used' },
  { value: 'remaining', label: 'Most left' },
] as const;

function days(value: number | null) {
  return value === null ? 'No limit' : String(value);
}

type LeaveUtilisationPageProps = {
  searchParams: Promise<{ year?: string; search?: string; leaveTypeId?: string; encashable?: string; sort?: string; page?: string }>;
};

// Each person's allowance, carried days, use and balance for a year, by leave type.
export default async function LeaveUtilisationPage({ searchParams }: LeaveUtilisationPageProps) {
  await requirePagePermission(permissionKeys.hrManage);
  const params = await searchParams;
  const thisYear = Number(todayInIndia().slice(0, 4));
  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : thisYear;
  const leaveTypeId = parseId(params.leaveTypeId);
  const sort = sorts.find((item) => item.value === params.sort)?.value ?? 'name';
  const page = parsePage(params.page);

  const [allRows, leaveTypes] = await Promise.all([getLeaveUtilisation(year), listLeaveTypes()]);

  const term = params.search ? cleanSearchTerm(params.search).toLowerCase() : '';
  const rows = allRows
    .filter(
      (row) =>
        (!term || row.full_name.toLowerCase().includes(term)) &&
        (!leaveTypeId || row.leave_type_id === leaveTypeId) &&
        (params.encashable !== 'yes' || row.is_encashable),
    )
    .sort((a, b) => {
      if (sort === 'used') return b.approved - a.approved || a.full_name.localeCompare(b.full_name);
      if (sort === 'remaining') return (b.remaining ?? -1) - (a.remaining ?? -1) || a.full_name.localeCompare(b.full_name);
      return a.full_name.localeCompare(b.full_name);
    });
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const encashableDays = sum((row) => (row.is_encashable && row.remaining !== null ? Math.max(0, row.remaining) : 0));

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, page: String(target) })) if (value) query.set(key, value);
    return `/hr/leave/utilisation?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Leave report"
        description={`Allowances, carried forward days and use in ${year}. Pending requests count as used in the balance.`}
        actions={
          <ConfirmActionButton
            label={`Carry forward ${thisYear - 1} leave`}
            title={`Carry forward unused ${thisYear - 1} leave?`}
            description="Unused days move into this year, up to each leave type's limit. This also runs by itself on 1 January. Running it again recalculates instead of adding twice."
            confirmLabel="Carry forward"
            variant="secondary"
            action={carryForwardLeaveAction.bind(null, thisYear - 1)}
          />
        }
      />
      <div className={layout.stack}>
        <form method="get" className={filterStyles.filters}>
          <TextField label="Year" name="year" type="number" min={2000} max={2200} defaultValue={year} />
          <TextField label="Search" name="search" type="search" placeholder="Employee name" defaultValue={params.search} />
          <SelectField
            label="Leave type"
            name="leaveTypeId"
            options={leaveTypes.map((type) => ({ value: type.id, label: type.name }))}
            placeholder="All types"
            defaultValue={leaveTypeId}
          />
          <SelectField
            label="Encashment"
            name="encashable"
            options={[{ value: 'yes', label: 'Encashable types only' }]}
            placeholder="All types"
            defaultValue={params.encashable}
          />
          <SelectField label="Sort by" name="sort" options={[...sorts]} defaultValue={sort} />
          <div className={filterStyles.actions}>
            <Button type="submit">Show</Button>
            <ButtonLink href="/hr/leave/utilisation" variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <StatTiles
          tiles={[
            { label: 'Days taken', value: sum((row) => row.approved) },
            { label: 'Days waiting for approval', value: sum((row) => row.pending) },
            { label: 'Days carried forward', value: sum((row) => row.carried_forward) },
            { label: 'Encashable days left', value: encashableDays },
          ]}
        />
        <Panel flush>
          {rows.length === 0 ? (
            <EmptyState icon={ChartColumn} title="No matching leave" description="Try different filters." />
          ) : (
            <>
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Employee</th>
                      <th scope="col">Leave type</th>
                      <th scope="col" className={tableStyles.numeric}>Allowance</th>
                      <th scope="col" className={tableStyles.numeric}>Carried forward</th>
                      <th scope="col" className={tableStyles.numeric}>Taken</th>
                      <th scope="col" className={tableStyles.numeric}>Waiting</th>
                      <th scope="col" className={tableStyles.numeric}>Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice((page - 1) * perPage, page * perPage).map((row) => (
                      <tr key={`${row.employee_id}-${row.leave_type_id}`}>
                        <td>
                          <Link href={`/people/employees/${row.employee_id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                            {row.full_name}
                          </Link>
                          <p className={tableStyles.secondaryText}>{row.department_name ?? 'No department'}</p>
                        </td>
                        <td>
                          {row.leave_type}
                          {row.is_encashable && <p className={tableStyles.secondaryText}>Can be encashed</p>}
                        </td>
                        <td className={tableStyles.numeric}>{days(row.yearly_allowance)}</td>
                        <td className={tableStyles.numeric}>{row.carried_forward || '—'}</td>
                        <td className={tableStyles.numeric}>{row.approved}</td>
                        <td className={tableStyles.numeric}>{row.pending || '—'}</td>
                        <td className={tableStyles.numeric}>{days(row.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar page={page} perPage={perPage} total={rows.length} hrefForPage={hrefForPage} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
