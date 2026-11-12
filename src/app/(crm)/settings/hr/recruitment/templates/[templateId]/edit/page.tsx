import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LetterTemplateForm } from '@/components/recruitment/RecruitmentForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getLetterTemplate } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Edit letter template' };

export default async function EditLetterTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const templateId = parseId((await params).templateId);
  if (!templateId) notFound();
  const template = await getLetterTemplate(templateId);
  if (!template) notFound();
  return (
    <>
      <PageHeader title={`Edit ${template.name}`} />
      <Panel>
        <LetterTemplateForm template={template} />
      </Panel>
    </>
  );
}
