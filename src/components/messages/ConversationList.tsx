import { Megaphone, MessageCircle, Users } from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/formatDate';
import type { ConversationSummary } from '@/server/services/messageService';
import styles from './ConversationList.module.css';

function ConversationIcon({ kind }: { kind: ConversationSummary['kind'] }) {
  if (kind === 'announcement') return <Megaphone size={16} aria-hidden="true" />;
  if (kind === 'direct') return <MessageCircle size={16} aria-hidden="true" />;
  return <Users size={16} aria-hidden="true" />;
}

type ConversationListProps = {
  conversations: ConversationSummary[];
  activeId?: string;
};

export function ConversationList({ conversations, activeId }: ConversationListProps) {
  if (conversations.length === 0) {
    return <p className={styles.empty}>No conversations yet. Start one with New message.</p>;
  }

  return (
    <ul className={styles.list}>
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            href={`/messages/${conversation.id}`}
            className={styles.item}
            aria-current={conversation.id === activeId ? 'page' : undefined}
          >
            <span className={styles.icon}>
              <ConversationIcon kind={conversation.kind} />
            </span>
            <span className={styles.text}>
              <span className={styles.title}>{conversation.displayTitle}</span>
              <span className={styles.preview}>
                {conversation.last_message_body
                  ? `${conversation.last_message_author ? `${conversation.last_message_author}: ` : ''}${conversation.last_message_body}`
                  : 'No messages yet'}
              </span>
            </span>
            <span className={styles.meta}>
              {conversation.last_message_body && (
                <time className={styles.time} dateTime={conversation.last_message_at}>
                  {formatDateTime(conversation.last_message_at)}
                </time>
              )}
              {conversation.unread_count > 0 && (
                <span className={styles.unread} aria-label={`${conversation.unread_count} unread`}>
                  {conversation.unread_count}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
