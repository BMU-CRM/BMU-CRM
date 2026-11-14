import { Pencil, PiggyBank, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { GroupedBarChart } from '@/components/charts/GroupedBarChart';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StatTiles } from '@/components/ui/StatTiles';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { financialYearStart, monthLabel } from '@/lib/finance/financialPeriods';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { deleteBudgetAction } from '@/server/actions/budgetActions';
import { requirePagePermission } from '@/server/services/accessService';
import { budgetState, listBudgetUsage } from '@/server/services/budgetService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Department budgets' };

const stateBadges = {
  ok: { tone: 'good', label: 'On track' },
  warning: { tone: 'warning', label: '80% used' },
  over: { tone: 'critical', label: 'Over budget' },
} as const;

function lastDayOf(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePagePermission(permissionKeys.budgetsManage);
  const params = await searchParams;
  const today = todayInIndia();
  const kind = params.kind === 'year' ? 'year' : 'month';
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const yearStart = params.fy && /^20\d{2}$/.test(params.fy) ? Number(params.fy) : financialYearStart(today);
  const departmentId = parseId(params.departmentId);
  const range = kind === 'month' ? { from: `${month}-01`, to: lastDayOf(month) } : { from: `${yearStart}-04-01`, to: `${yearStart + 1}-03-31` };

  const [budgets, departments] = await Promise.all([listBudgetUsage(range, { kind, departmentId }), listDepartments()]);
  const total = budgets.reduce((sum, row) => sum + row.amount, 0);
  const spent = budgets.reduce((sum, row) => sum + row.spent, 0);
  const over = budgets.filter((row) => row.utilisation >= 100).length;
  const periodName = kind === 'month' ? monthLabel(month) : `April ${yearStart} to March ${yearStart + 1}`;
  const years = [yearStart - 2, yearStart - 1, yearStart, yearStart + 1].filter((year, index, all) => all.indexOf(year) === index);

  return (
    <>
      <PageHeader
        title="Department budgets"
        description="What each department may spend in a month or a financial year, against its expenses. Finance and the department head are told at 80% and at 100%."
        actions={
          <ButtonLink href="/finance/budgets/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            Set a budget
          </ButtonLink>
        }
      />
      <PageTabs
        label="Budget periods"
        tabs={[
          { href: '/finance/budgets', label: 'Monthly', current: kind === 'month' },
          { href: '/finance/budgets?kind=year', label: 'Financial year', current: kind === 'year' },
        ]}
      />
      <div className={layout.stack}>
        <form method="get" className={filterStyles.filters}>
          <input type="hidden" name="kind" value={kind} />
          {kind === 'month' ? (
            <TextField label="Month" name="month" type="month" defaultValue={month} />
          ) : (
            <SelectField label="Financial year" name="fy" options={years.map((year) => ({ value: String(year), label: `${year}-${String((year + 1) % 100).padStart(2, '0')}` }))} defaultValue={String(yearStart)} />
          )}
          <SelectField label="Department" name="departmentId" options={departments.map((department) => ({ value: department.id, label: department.name }))} placeholder="All departments" defaultValue={departmentId} />
          <div className={filterStyles.actions}>
            <ButtonLink href={kind === 'year' ? '/finance/budgets?kind=year' : '/finance/budgets'} variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <StatTiles
          tiles={[
            { label: `Budgeted, ${periodName}`, value: formatRupees(total) },
            { label: 'Spent', value: formatRupees(spent) },
            { label: 'Remaining', value: formatRupees(total - spent) },
            { label: 'Over budget', value: over },
          ]}
        />
        {budgets.length === 0 ? (
          <Panel>
            <EmptyState
              icon={PiggyBank}
              title={`No budgets for ${periodName}`}
              description="Set a budget for a department to track its spending."
              action={<ButtonLink href="/finance/budgets/new" variant="primary">Set a budget</ButtonLink>}
            />
          </Panel>
        ) : (
          <>
            <Panel title="Budget and spending by department" description={`Expenses entered against each department in ${periodName}.`}>
              <GroupedBarChart
                label={`Budget and spending by department, ${periodName}`}
                series={['Budget', 'Spent']}
                groups={budgets.map((row) => ({ label: row.department_name, values: [row.amount, row.spent] }))}
                formatValue={formatRupees}
              />
            </Panel>
            <Panel flush>
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Department</th>
                      <th scope="col" className={tableStyles.numeric}>Budget</th>
                      <th scope="col" className={tableStyles.numeric}>Spent</th>
                      <th scope="col" className={tableStyles.numeric}>Remaining</th>
                      <th scope="col">Used</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((row) => {
                      const badge = stateBadges[budgetState(row.utilisation)];
                      return (
                        <tr key={row.budget_id}>
                          <td>
                            <p className={tableStyles.primaryText}>{row.department_name}</p>
                            {row.notes && <p className={tableStyles.secondaryText}>{row.notes}</p>}
                          </td>
                          <td className={tableStyles.numeric}>{formatRupees(row.amount)}</td>
                          <td className={tableStyles.numeric}>{formatRupees(row.spent)}</td>
                          <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(row.remaining)}</td>
                          <td>
                            <ProgressBar value={Math.min(row.utilisation, 100)} label={`${row.utilisation}% of the budget used`} />
                            <p className={tableStyles.secondaryText}>{row.utilisation}%</p>
                            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                          </td>
                          <td>
                            <div className={tableStyles.rowActions}>
                              <ButtonLink href={`/finance/budgets/${row.budget_id}/edit`} variant="ghost">
                                <Pencil size={16} aria-hidden="true" />
                                Edit
                              </ButtonLink>
                              <ConfirmActionButton
                                label="Delete"
                                title={`Delete the ${row.department_name} budget?`}
                                description="Only the budget is deleted. The department's expenses stay as they are."
                                confirmLabel="Delete budget"
                                variant="danger"
                                action={deleteBudgetAction.bind(null, row.budget_id)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
