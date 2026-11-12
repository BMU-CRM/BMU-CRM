import type { Metadata } from 'next';
import { CalendarCategoryForm } from '@/components/meetings/CalendarCategoryForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listCalendarCategories } from '@/server/services/meetingService';

export const metadata: Metadata = { title: 'Content calendar' };

export default async function ContentCalendarSettingsPage() {
  await requirePagePermission(permissionKeys.contentCalendarManage);
  const [categories, people] = await Promise.all([listCalendarCategories(), listEmployeeOptions()]);
  const options = people.map((person) => ({ value: person.id, label: person.full_name }));

  return (
    <>
      <PageHeader
        title="Content calendar"
        description="Categories of content work and who each goes to. When an entry is added to the calendar under a category, its people are added, notified and see it in their calendar."
      />
      <div className={layout.stack}>
        {categories.map((category) => (
          <Panel key={category.id} title={category.name} description={category.is_active ? undefined : 'Not in use: hidden from new entries.'}>
            <CalendarCategoryForm
              category={{ id: category.id, name: category.name, description: category.description, is_active: category.is_active, memberIds: category.members.map((member) => member.id) }}
              people={options}
            />
          </Panel>
        ))}
        <Panel title="Add a category">
          <CalendarCategoryForm people={options} />
        </Panel>
      </div>
    </>
  );
}
