import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeeEditForm } from '@/components/employees/EmployeeEditForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getEmployee, getEmployeeControls, listManagerOptions } from '@/server/services/employeeService';
import {
  listAssignableRoles,
  listDepartments,
  listDesignations,
} from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Edit employee' };

type EditEmployeePageProps = {
  params: Promise<{ employeeId: string }>;
};

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const access = await requirePagePermission(permissionKeys.employeesUpdate);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();

  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  const controls = await getEmployeeControls(access, employee);
  if (!controls.canEdit) notFound();

  const [roles, designations, departments, managers] = await Promise.all([
    listAssignableRoles(),
    listDesignations(),
    listDepartments(),
    listManagerOptions(access, permissionKeys.employeesUpdate),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${employee.full_name}`} />
      <Panel>
        <EmployeeEditForm
          employee={employee}
          roles={roles.map((role) => ({ value: role.id, label: role.name }))}
          designations={designations.map((designation) => ({ value: designation.id, label: designation.title }))}
          departments={departments.map((department) => ({ value: department.id, label: department.name }))}
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
          canTransfer={controls.canTransfer}
          canChangeRole={controls.canChangeRole}
        />
      </Panel>
    </>
  );
}
