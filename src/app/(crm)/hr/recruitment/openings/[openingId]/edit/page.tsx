import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpeningForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getOpening, getRecruitmentOptions } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Edit job opening' };

export default async function EditOpeningPage({ params }: { params: Promise<{ openingId: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const openingId = parseId((await params).openingId);
  if (!openingId) notFound();
  const [opening, options] = await Promise.all([getOpening(openingId), getRecruitmentOptions()]);
  if (!opening) notFound();
  return (
    <>
      <PageHeader title={`Edit ${opening.title}`} />
      <Panel>
        <OpeningForm opening={opening} options={options} />
      </Panel>
    </>
  );
}
