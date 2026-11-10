import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import { DepartmentForm } from '@/components/organisation/DepartmentForm';
import { OrganisationRowActions } from '@/components/organisation/OrganisationRowActions';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listDepartments } from '@/server/services/organisationService';
import styles from '../OrganisationPages.module.css';

export const metadata: Metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  await requirePagePermission(permissionKeys.departmentsManage);

  const [departments, employees] = await Promise.all([listDepartments(), listEmployeeOptions()]);

  return (
    <>
      <PageHeader title="Departments" description="Add departments and set who leads them." />
      <div className={styles.stack}>
        <Panel title="Add a department">
          {/* The key gives a fresh, empty form after each add. */}
          <DepartmentForm
            key={departments.length}
            departments={departments.map((department) => ({ value: department.id, label: department.name }))}
            employees={employees.map((employee) => ({ value: employee.id, label: employee.full_name }))}
          />
        </Panel>
        <Panel flush>
          {departments.length === 0 ? (
            <EmptyState icon={Building2} title="No departments yet" description="Add your first department above." />
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col">Head</th>
                    <th scope="col">Parent</th>
                    <th scope="col">
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.id}>
                      <td>
                        <p className={tableStyles.primaryText}>{department.name}</p>
                        {department.description && <p className={tableStyles.secondaryText}>{department.description}</p>}
                      </td>
                      <td>{department.head?.full_name ?? '—'}</td>
                      <td>{department.parent?.name ?? '—'}</td>
                      <td>
                        <OrganisationRowActions
                          kind="department"
                          id={department.id}
                          name={department.name}
                          editHref={`/people/departments/${department.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
