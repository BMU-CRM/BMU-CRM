import type { Metadata } from 'next';
import { OpeningForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { getRecruitmentOptions } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Add job opening' };

export default async function NewOpeningPage() {
  await requirePagePermission(permissionKeys.recruitmentManage);
  return (
    <>
      <PageHeader title="Add job opening" />
      <Panel>
        <OpeningForm options={await getRecruitmentOptions()} />
      </Panel>
    </>
  );
}
