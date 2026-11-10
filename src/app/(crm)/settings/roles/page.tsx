import { Plus, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { OrganisationRowActions } from '@/components/organisation/OrganisationRowActions';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listRoles } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Roles' };

export default async function RolesPage() {
  await requirePagePermission(permissionKeys.rolesManage);

  const roles = await listRoles();

  return (
    <>
      <PageHeader
        title="Roles"
        description="A role decides what someone can see and do. Dashboards and menus follow automatically."
        actions={
          <ButtonLink href="/settings/roles/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            New role
          </ButtonLink>
        }
      />
      <Panel flush>
        {roles.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No roles yet" description="Create your first role." />
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col" className={tableStyles.numeric}>
                    Permissions
                  </th>
                  <th scope="col" className={tableStyles.numeric}>
                    Employees
                  </th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <p className={tableStyles.primaryText}>{role.name}</p>
                      {role.description && <p className={tableStyles.secondaryText}>{role.description}</p>}
                    </td>
                    <td className={tableStyles.numeric}>{role.role_permissions[0]?.count ?? 0}</td>
                    <td className={tableStyles.numeric}>{role.employees[0]?.count ?? 0}</td>
                    <td>
                      {role.is_protected ? (
                        <div className={tableStyles.rowActions}>
                          <StatusBadge>Protected</StatusBadge>
                        </div>
                      ) : (
                        <OrganisationRowActions
                          kind="role"
                          id={role.id}
                          name={role.name}
                          editHref={`/settings/roles/${role.id}`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
