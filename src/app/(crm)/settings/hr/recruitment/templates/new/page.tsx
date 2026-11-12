import type { Metadata } from 'next';
import { LetterTemplateForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Add letter template' };

export default async function NewLetterTemplatePage() {
  await requirePagePermission(permissionKeys.recruitmentManage);
  return (
    <>
      <PageHeader title="Add letter template" />
      <Panel>
        <LetterTemplateForm />
      </Panel>
    </>
  );
}
