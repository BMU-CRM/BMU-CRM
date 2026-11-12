import type { Metadata } from 'next';
import { BudgetForm } from '@/components/finance/BudgetForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { financialYearStart } from '@/lib/finance/financialPeriods';
import { todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Set a budget' };

export default async function NewBudgetPage() {
  await requirePagePermission(permissionKeys.budgetsManage);
  const today = todayInIndia();
  const year = financialYearStart(today);
  const departments = (await listDepartments()).filter((department) => department.is_active);
  return (
    <>
      <PageHeader title="Set a budget" description="For one department, for a month or a financial year." />
      <Panel>
        <BudgetForm
          departments={departments.map((department) => ({ value: department.id, label: department.name }))}
          years={[year - 1, year, year + 1]}
          defaultMonth={today.slice(0, 7)}
          defaultYear={year}
        />
      </Panel>
    </>
  );
}
