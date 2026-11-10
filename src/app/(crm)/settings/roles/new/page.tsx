import type { Metadata } from 'next';
import { RoleForm } from '@/components/roles/RoleForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listPermissions } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'New role' };

export default async function NewRolePage() {
  await requirePagePermission(permissionKeys.rolesManage);

  const permissions = await listPermissions();

  return (
    <>
      <PageHeader title="New role" description="Choose what this role can do, and how far that access reaches." />
      <Panel>
        <RoleForm permissions={permissions} />
      </Panel>
    </>
  );
}
