import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayrollRuleForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { payrollRuleLabels } from '@/lib/validation/payrollSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { getPayrollRule } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Edit payroll rule' };

export default async function EditPayrollRulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const ruleId = parseId((await params).ruleId);
  if (!ruleId) notFound();
  const rule = await getPayrollRule(ruleId);
  if (!rule) notFound();
  return (
    <>
      <PageHeader title={`Edit ${payrollRuleLabels[rule.kind]} rule`} description="To change a rate from a new date, add a new rule instead, so earlier months keep theirs." />
      <Panel>
        <PayrollRuleForm kind={rule.kind} rule={rule} today={todayInIndia()} />
      </Panel>
    </>
  );
}
