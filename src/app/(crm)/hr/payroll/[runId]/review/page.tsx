import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayrollDecisionForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { parseId } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { requirePagePermission } from '@/server/services/accessService';
import { getPayrollRun } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Approve payroll' };

export default async function ReviewPayrollPage({ params }: { params: Promise<{ runId: string }> }) {
  await requirePagePermission(permissionKeys.payrollApprove);
  const runId = parseId((await params).runId);
  if (!runId) notFound();
  const run = await getPayrollRun(runId);
  if (!run || run.status !== 'in_review') notFound();

  return (
    <>
      <PageHeader title={`Approve payroll for ${formatPayrollMonth(run.month)}`} description="Check the payslips on the run page first. Approving lets you mark it paid." />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'People', value: run.employee_count },
            { label: 'Net pay', value: formatRupees(run.total_net) },
            { label: 'Cost to company', value: formatRupees(run.total_employer_cost) },
          ]}
        />
        <Panel>
          <PayrollDecisionForm runId={run.id} />
        </Panel>
      </div>
    </>
  );
}
