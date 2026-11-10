import { UserPlus, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { EmployeeDirectoryFilters } from '@/components/employees/EmployeeDirectoryFilters';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys, type PermissionScope } from '@/lib/access/permissionKeys';
import { parseId, parsePage } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { employeesPerPage, listEmployees } from '@/server/services/employeeService';
import { listDepartments, listRoles } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Employees' };

const directoryReach: Record<PermissionScope, string> = {
  own: 'You, your manager and your colleagues',
  team: 'You and your team',
  department: 'Your department and team',
  organisation: 'Everyone',
};

type EmployeesPageProps = {
  searchParams: Promise<{
    search?: string;
    departmentId?: string;
    roleId?: string;
    accountStatus?: string;
    page?: string;
  }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const access = await requirePagePermission(permissionKeys.employeesView);
  const params = await searchParams;

  const accountStatus =
    params.accountStatus === 'active' || params.accountStatus === 'inactive' ? params.accountStatus : undefined;
  const page = parsePage(params.page);
  const departmentId = parseId(params.departmentId);
  const roleId = parseId(params.roleId);

  const [{ employees, total }, departments, roles] = await Promise.all([
    listEmployees(access, { search: params.search, departmentId, roleId, accountStatus, page }),
    listDepartments(),
    listRoles(),
  ]);

  const canCreate = access.permissions[permissionKeys.employeesCreate] !== undefined;
  const isFiltered = Boolean(params.search || departmentId || roleId || accountStatus);
  const reach = directoryReach[access.permissions[permissionKeys.employeesView] ?? 'own'];

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (departmentId) query.set('departmentId', departmentId);
    if (roleId) query.set('roleId', roleId);
    if (accountStatus) query.set('accountStatus', accountStatus);
    query.set('page', String(target));
    return `/people/employees?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Employees"
        description={`${reach}: ${total} ${total === 1 ? 'person' : 'people'}`}
        actions={
          canCreate && (
            <ButtonLink href="/people/employees/new" variant="primary">
              <UserPlus size={16} aria-hidden="true" />
              Add employee
            </ButtonLink>
          )
        }
      />
      <EmployeeDirectoryFilters
        departments={departments.map((department) => ({ value: department.id, label: department.name }))}
        roles={roles.map((role) => ({ value: role.id, label: role.name }))}
        values={{ search: params.search, departmentId, roleId, accountStatus }}
      />
      <Panel flush>
        {employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isFiltered ? 'No matching employees' : 'No employees yet'}
            description={isFiltered ? 'Try different filters.' : 'Employees appear here once they are added.'}
          />
        ) : (
          <>
            <EmployeeTable employees={employees} />
            <PaginationBar page={page} perPage={employeesPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
