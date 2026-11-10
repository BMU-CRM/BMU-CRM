import type { Metadata } from 'next';
import { DirectMessageForm, GroupConversationForm } from '@/components/messages/NewConversationForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'New message' };

export default async function NewConversationPage() {
  const access = await requirePagePermission(permissionKeys.messagesUse);

  const people = (await listEmployeeOptions())
    .filter((person) => person.id !== access.employee.id)
    .map((person) => ({ value: person.id, label: person.full_name }));

  return (
    <>
      <PageHeader
        title="New message"
        description="Department, project and client channels are created for you automatically."
      />
      <div className={layout.columns}>
        <Panel title="Message one person">
          <DirectMessageForm people={people} />
        </Panel>
        <Panel title="Start a group">
          <GroupConversationForm people={people} />
        </Panel>
      </div>
    </>
  );
}
