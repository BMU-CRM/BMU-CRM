import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import styles from '@/app/(crm)/messages/MessagesLayout.module.css';
import type { ConversationSummary } from '@/server/services/messageService';
import { ConversationList } from './ConversationList';

type MessagesShellProps = {
  conversations: ConversationSummary[];
  activeId?: string;
  search?: string;
  children: ReactNode;
};

// The conversation list beside the open conversation. On a phone, only one shows.
export function MessagesShell({ conversations, activeId, search, children }: MessagesShellProps) {
  return (
    <div className={styles.layout} data-has-conversation={Boolean(activeId)}>
      <aside className={styles.sidebar} aria-label="Conversations">
        <div className={styles.sidebarHeader}>
          <ButtonLink href="/messages/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            New message
          </ButtonLink>
          <form method="get" action="/messages" className={styles.search} role="search">
            <label htmlFor="message-search" className="visually-hidden">
              Search messages
            </label>
            <input
              id="message-search"
              name="search"
              type="search"
              placeholder="Search messages"
              defaultValue={search}
              className={styles.searchInput}
            />
          </form>
        </div>
        <div className={styles.scroll}>
          <ConversationList conversations={conversations} activeId={activeId} />
        </div>
      </aside>
      <section className={styles.main}>{children}</section>
    </div>
  );
}
