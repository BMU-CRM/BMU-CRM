import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { HrSettingsTabs } from '@/components/hr/HrSettingsTabs';
import { OnboardingItemForm } from '@/components/recruitment/RecruitmentForms';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { letterKindLabels, type LetterKind } from '@/lib/validation/recruitmentSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { listLetterTemplates, listOnboardingItems } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Recruitment settings' };

export default async function RecruitmentSettingsPage() {
  const access = await requirePagePermission(permissionKeys.recruitmentManage);
  const [templates, items] = await Promise.all([listLetterTemplates(), listOnboardingItems()]);

  return (
    <>
      <PageHeader title="HR settings" description="Letter templates and the onboarding checklist." />
      <HrSettingsTabs current="recruitment" permissions={access.permissions} />
      <div className={layout.stack}>
        <Panel
          title="Letter templates"
          description="Offer, internship completion, experience and relieving letters, filled in with each person's details when printed."
          action={
            <ButtonLink href="/settings/hr/recruitment/templates/new" variant="ghost">
              <Plus size={16} aria-hidden="true" />
              Add
            </ButtonLink>
          }
          flush
        >
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Letter</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <Link href={`/settings/hr/recruitment/templates/${template.id}/edit`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                        {template.name}
                      </Link>
                      <p className={tableStyles.secondaryText}>{template.subject}</p>
                    </td>
                    <td>{letterKindLabels[template.kind as LetterKind]}</td>
                    <td>
                      <StatusBadge tone={template.is_active ? 'good' : 'neutral'}>{template.is_active ? 'In use' : 'Off'}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Onboarding checklist" description="Added for each new joiner when a candidate is converted to an employee." flush>
          <ul className={layout.list}>
            {items.map((item) => (
              <li key={item.id} className={layout.sectionForm}>
                <OnboardingItemForm item={item} />
              </li>
            ))}
            <li className={layout.sectionForm}>
              <p className={`${layout.rowTitle} ${layout.muted}`}>Add an item</p>
              <OnboardingItemForm />
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
