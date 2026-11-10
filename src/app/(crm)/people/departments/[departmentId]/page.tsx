import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DepartmentForm } from '@/components/organisation/DepartmentForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { getDepartment, listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Edit department' };

type EditDepartmentPageProps = {
  params: Promise<{ departmentId: string }>;
};

export default async function EditDepartmentPage({ params }: EditDepartmentPageProps) {
  await requirePagePermission(permissionKeys.departmentsManage);
  const departmentId = parseId((await params).departmentId);
  if (!departmentId) notFound();

  const [department, departments, employees] = await Promise.all([
    getDepartment(departmentId),
    listDepartments(),
    listEmployeeOptions(),
  ]);
  if (!department) notFound();

  return (
    <>
      <PageHeader title={`Edit ${department.name}`} />
      <Panel>
        <DepartmentForm
          department={department}
          departments={departments.map((option) => ({ value: option.id, label: option.name }))}
          employees={employees.map((employee) => ({ value: employee.id, label: employee.full_name }))}
        />
      </Panel>
    </>
  );
}
