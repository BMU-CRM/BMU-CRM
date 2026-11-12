import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppraisalForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { getAppraisal } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Edit appraisal' };

export default async function EditAppraisalPage({ params }: { params: Promise<{ appraisalId: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const appraisalId = parseId((await params).appraisalId);
  if (!appraisalId) notFound();
  const [appraisal, employees] = await Promise.all([getAppraisal(appraisalId), listEmployeeOptions()]);
  if (!appraisal) notFound();
  return (
    <>
      <PageHeader title="Edit appraisal" />
      <Panel>
        <AppraisalForm appraisal={appraisal} employees={employees.map((employee) => ({ value: employee.id, label: employee.full_name }))} />
      </Panel>
    </>
  );
}
