import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoleForm } from '@/components/roles/RoleForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getRoleWithPermissions, listPermissions } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Edit role' };

type EditRolePageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function EditRolePage({ params }: EditRolePageProps) {
  await requirePagePermission(permissionKeys.rolesManage);
  const roleId = parseId((await params).roleId);
  if (!roleId) notFound();

  const [role, permissions] = await Promise.all([getRoleWithPermissions(roleId), listPermissions()]);
  if (!role || role.is_protected) notFound();

  return (
    <>
      <PageHeader title={`Edit ${role.name}`} description="Changes apply to everyone with this role straight away." />
      <Panel>
        <RoleForm role={role} permissions={permissions} />
      </Panel>
    </>
  );
}
