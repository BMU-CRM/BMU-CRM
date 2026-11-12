import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayrollLineForm } from '@/components/payroll/PayrollForms';
import { PayslipBreakdown } from '@/components/payroll/PayslipBreakdown';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import { requirePagePermission } from '@/server/services/accessService';
import { getPayrollLine } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Change payslip' };

type PayrollLinePageProps = {
  params: Promise<{ runId: string; lineId: string }>;
};

export default async function PayrollLinePage({ params }: PayrollLinePageProps) {
  await requirePagePermission(permissionKeys.payrollManage);
  const { runId, lineId } = await params;
  const run = parseId(runId);
  const id = parseId(lineId);
  if (!run || !id) notFound();

  const line = await getPayrollLine(id);
  if (!line || line.run_id !== run || line.run?.status !== 'draft') notFound();

  return (
    <>
      <PageHeader title={`${line.employee?.full_name}: ${formatPayrollMonth(line.run.month)}`} description="Statutory deductions and pay for days worked are worked out; change only what varies this month." />
      <div className={layout.columns}>
        <Panel>
          <PayrollLineForm runId={run} lineId={id} line={line} />
        </Panel>
        <Panel title="Payslip now" flush>
          <PayslipBreakdown line={line} />
        </Panel>
      </div>
    </>
  );
}
