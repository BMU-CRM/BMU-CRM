import { Plus, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import styles from '@/app/(crm)/messages/MessagesLayout.module.css';
import { getCurrentAccess } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import type { ConversationSummary } from '@/server/services/messageService';
import { ConversationSearch } from './ConversationSearch';

type MessagesShellProps = {
  conversations: ConversationSummary[];
  activeId?: string;
  children: ReactNode;
};

// The conversation list beside the open conversation. On a phone, only one shows. Its
// search finds people and chats by name; messages are searched inside each chat.
export async function MessagesShell({ conversations, activeId, children }: MessagesShellProps) {
  const [access, employees] = await Promise.all([getCurrentAccess(), listEmployeeOptions()]);
  const myId = access.status === 'ready' ? access.employee.id : null;
  const people = employees.filter((person) => person.id !== myId).map((person) => ({ id: person.id, name: person.full_name }));

  return (
    <div className={styles.layout} data-has-conversation={Boolean(activeId)}>
      <aside className={styles.sidebar} aria-label="Conversations">
        <ConversationSearch
          conversations={conversations}
          activeId={activeId}
          people={people}
          actions={
            <div className={styles.sidebarButtons}>
              <ButtonLink href="/messages/new" variant="primary">
                <Plus size={16} aria-hidden="true" />
                New message
              </ButtonLink>
              <ButtonLink href="/messages/starred" aria-label="Starred messages" title="Starred messages">
                <Star size={16} aria-hidden="true" />
              </ButtonLink>
            </div>
          }
        />
      </aside>
      <section className={styles.main}>{children}</section>
    </div>
  );
}
