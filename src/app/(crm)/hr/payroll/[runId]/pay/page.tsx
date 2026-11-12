import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarkPayrollPaidForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { requirePagePermission } from '@/server/services/accessService';
import { getPayingAccountOptions } from '@/server/services/ledgerService';
import { getPayrollRun } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Mark payroll paid' };

export default async function PayPayrollPage({ params }: { params: Promise<{ runId: string }> }) {
  await requirePagePermission(permissionKeys.payrollApprove);
  const runId = parseId((await params).runId);
  if (!runId) notFound();
  const run = await getPayrollRun(runId);
  if (!run || run.status !== 'approved') notFound();

  return (
    <>
      <PageHeader
        title={`Mark ${formatPayrollMonth(run.month)} payroll as paid`}
        description={`${run.employee_count} people, ${formatRupees(run.total_net)} net. Everyone can then see their payslip.`}
      />
      <Panel>
        <MarkPayrollPaidForm runId={run.id} today={todayInIndia()} {...await getPayingAccountOptions()} />
      </Panel>
    </>
  );
}
