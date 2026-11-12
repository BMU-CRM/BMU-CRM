import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SalaryStructureForm } from '@/components/payroll/PayrollForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getEmployee } from '@/server/services/employeeService';
import { getEmployeeSalary } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Salary structure' };

export default async function NewSalaryStructurePage({ params }: { params: Promise<{ employeeId: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  const { structures } = await getEmployeeSalary(employeeId);
  const latest = structures[0] ?? null;
  const today = todayInIndia();

  return (
    <>
      <PageHeader
        title={latest ? `Revise salary: ${employee.full_name}` : `Set salary: ${employee.full_name}`}
        description="Monthly amounts. The current figures are filled in to start from."
      />
      <Panel>
        <SalaryStructureForm
          employeeId={employeeId}
          previous={latest}
          defaultDate={latest ? `${today.slice(0, 7)}-01` : (employee.joining_date ?? today)}
        />
      </Panel>
    </>
  );
}
