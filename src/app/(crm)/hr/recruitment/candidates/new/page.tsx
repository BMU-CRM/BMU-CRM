import type { Metadata } from 'next';
import { CandidateForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getRecruitmentOptions } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Add candidate' };

export default async function NewCandidatePage({ searchParams }: { searchParams: Promise<{ openingId?: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const openingId = parseId((await searchParams).openingId);
  const options = await getRecruitmentOptions();
  return (
    <>
      <PageHeader title="Add candidate" description="Add the resume and other files on the candidate's page once saved." />
      <Panel>
        <CandidateForm options={options} openingId={openingId} />
      </Panel>
    </>
  );
}
