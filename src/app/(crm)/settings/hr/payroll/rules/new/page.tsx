import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayrollRuleForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { payrollRuleKinds, payrollRuleLabels } from '@/lib/validation/payrollSchema';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Add payroll rule' };

export default async function NewPayrollRulePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const requested = (await searchParams).kind;
  const kind = payrollRuleKinds.find((item) => item === requested);
  if (!kind) notFound();
  return (
    <>
      <PageHeader title={`Add ${payrollRuleLabels[kind]} rule`} />
      <Panel>
        <PayrollRuleForm kind={kind} today={todayInIndia()} />
      </Panel>
    </>
  );
}
