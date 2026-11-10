import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DesignationForm } from '@/components/organisation/DesignationForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getDesignation } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Edit designation' };

type EditDesignationPageProps = {
  params: Promise<{ designationId: string }>;
};

export default async function EditDesignationPage({ params }: EditDesignationPageProps) {
  await requirePagePermission(permissionKeys.designationsManage);
  const designationId = parseId((await params).designationId);
  if (!designationId) notFound();

  const designation = await getDesignation(designationId);
  if (!designation) notFound();

  return (
    <>
      <PageHeader title={`Edit ${designation.title}`} />
      <Panel>
        <DesignationForm designation={designation} />
      </Panel>
    </>
  );
}
