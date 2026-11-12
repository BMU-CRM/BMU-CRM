import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CandidateForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getCandidate, getRecruitmentOptions } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Edit candidate' };

export default async function EditCandidatePage({ params }: { params: Promise<{ candidateId: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const candidateId = parseId((await params).candidateId);
  if (!candidateId) notFound();
  const [candidate, options] = await Promise.all([getCandidate(candidateId), getRecruitmentOptions()]);
  if (!candidate) notFound();
  return (
    <>
      <PageHeader title={`Edit ${candidate.full_name}`} />
      <Panel>
        <CandidateForm candidate={candidate} options={options} />
      </Panel>
    </>
  );
}
