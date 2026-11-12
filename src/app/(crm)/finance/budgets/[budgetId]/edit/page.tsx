import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BudgetForm } from '@/components/finance/BudgetForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { financialYearStart } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getBudget } from '@/server/services/budgetService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Edit budget' };

export default async function EditBudgetPage({ params }: { params: Promise<{ budgetId: string }> }) {
  await requirePagePermission(permissionKeys.budgetsManage);
  const budgetId = parseId((await params).budgetId);
  if (!budgetId) notFound();
  const [budget, departments] = await Promise.all([getBudget(budgetId), listDepartments()]);
  if (!budget) notFound();
  const today = todayInIndia();
  const year = financialYearStart(today);
  const budgetYear = financialYearStart(budget.period_start);
  return (
    <>
      <PageHeader title="Edit budget" />
      <Panel>
        <BudgetForm
          budget={{ ...budget, amount: Number(budget.amount) }}
          departments={departments
            .filter((department) => department.is_active || department.id === budget.department_id)
            .map((department) => ({ value: department.id, label: department.name }))}
          years={[...new Set([budgetYear, year - 1, year, year + 1])].sort()}
          defaultMonth={today.slice(0, 7)}
          defaultYear={year}
        />
      </Panel>
    </>
  );
}
