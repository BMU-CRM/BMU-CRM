import type { Metadata } from 'next';
import { EmployeeCreateForm } from '@/components/employees/EmployeeCreateForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { getDefaultRole, listManagerOptions } from '@/server/services/employeeService';
import {
  listAssignableRoles,
  listDepartments,
  listDesignations,
} from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Add employee' };

export default async function NewEmployeePage() {
  const access = await requirePagePermission(permissionKeys.employeesCreate);
  const canChooseRole = access.permissions[permissionKeys.employeesAssignRole] !== undefined;
  const isTeamOnly = access.permissions[permissionKeys.employeesCreate] === 'team';
  const ownDepartmentOnly = access.permissions[permissionKeys.employeesCreate] !== 'organisation';

  const [roles, defaultRole, designations, departments, managers] = await Promise.all([
    canChooseRole ? listAssignableRoles() : Promise.resolve([]),
    canChooseRole ? Promise.resolve(null) : getDefaultRole(),
    listDesignations(),
    listDepartments(),
    listManagerOptions(access, permissionKeys.employeesCreate),
  ]);

  // The options match can_create_employee, which has the final say.
  const departmentOptions = departments
    .filter((department) => !ownDepartmentOnly || department.id === access.employee.department_id)
    .map((department) => ({ value: department.id, label: department.name }));

  return (
    <>
      <PageHeader
        title="Add employee"
        description={
          isTeamOnly
            ? 'Add someone to your team. Afterwards, create an invitation link for them on their profile.'
            : 'Afterwards, create an invitation link for them on their profile.'
        }
      />
      <Panel>
        <EmployeeCreateForm
          roles={roles.map((role) => ({ value: role.id, label: role.name }))}
          fixedRoleName={canChooseRole ? null : (defaultRole?.name ?? 'the default role')}
          designations={designations.map((designation) => ({ value: designation.id, label: designation.title }))}
          departments={departmentOptions}
          managers={managers.map((manager) => ({ value: manager.id, label: manager.full_name }))}
          isTeamOnly={isTeamOnly}
          defaultManagerId={isTeamOnly ? access.employee.id : undefined}
        />
      </Panel>
    </>
  );
}
