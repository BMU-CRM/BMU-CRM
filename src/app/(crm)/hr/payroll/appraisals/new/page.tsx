import type { Metadata } from 'next';
import { AppraisalForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'Add appraisal' };

export default async function NewAppraisalPage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const employeeId = parseId((await searchParams).employeeId);
  const employees = await listEmployeeOptions();
  return (
    <>
      <PageHeader title="Add appraisal" />
      <Panel>
        <AppraisalForm employees={employees.map((employee) => ({ value: employee.id, label: employee.full_name }))} employeeId={employeeId} />
      </Panel>
    </>
  );
}
