import type { Metadata } from 'next';
import { ExitChecklistItemForm, NoticePeriodForm } from '@/components/exits/ExitForms';
import { HrSettingsTabs } from '@/components/hr/HrSettingsTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { getNoticePeriod, listExitChecklistItems } from '@/server/services/exitService';

export const metadata: Metadata = { title: 'Exit settings' };

export default async function ExitSettingsPage() {
  const access = await requirePagePermission(permissionKeys.exitsManage);
  const [noticeDays, items] = await Promise.all([getNoticePeriod(), listExitChecklistItems()]);

  return (
    <>
      <PageHeader title="HR settings" description="Notice period and the exit checklist." />
      <HrSettingsTabs current="exits" permissions={access.permissions} />
      <div className={layout.stack}>
        <Panel title="Notice period" description="Sets each leaver's suggested last working day and any notice recovery.">
          <NoticePeriodForm days={noticeDays} />
        </Panel>
        <Panel title="Exit checklist" description="Added for each leaver when their resignation is accepted." flush>
          <ul className={layout.list}>
            {items.map((item) => (
              <li key={item.id} className={layout.sectionForm}>
                <ExitChecklistItemForm item={item} />
              </li>
            ))}
            <li className={layout.sectionForm}>
              <p className={`${layout.rowTitle} ${layout.muted}`}>Add an item</p>
              <ExitChecklistItemForm />
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
