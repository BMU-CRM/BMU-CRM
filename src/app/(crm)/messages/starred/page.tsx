import { Star } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { MessagesShell } from '@/components/messages/MessagesShell';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateTime } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { listMyConversations, listStarredMessages } from '@/server/services/messageService';
import styles from '../MessagesLayout.module.css';

export const metadata: Metadata = { title: 'Starred messages' };

// Messages you starred, across every conversation, newest star first.
export default async function StarredMessagesPage() {
  await requirePagePermission(permissionKeys.messagesUse);

  const [conversations, starred] = await Promise.all([listMyConversations(), listStarredMessages()]);
  const titles = new Map(conversations.map((conversation) => [conversation.id, conversation.displayTitle]));

  return (
    <MessagesShell conversations={conversations}>
      <header className={styles.mainHeader}>
        <div>
          <Link href="/messages" className={styles.back}>
            ‹ All conversations
          </Link>
          <h1 className={styles.title}>Starred messages</h1>
          <p className={styles.subtitle}>Star a message from its ⌄ menu to keep it here.</p>
        </div>
      </header>
      <div className={styles.scroll}>
        {starred.length === 0 ? (
          <p className={styles.placeholder}>
            <Star size={16} aria-hidden="true" /> No starred messages yet.
          </p>
        ) : (
          <ul className={styles.results}>
            {starred.map((message) => (
              <li key={message.id}>
                <Link href={`/messages/${message.conversation_id}#message-${message.id}`} className={styles.result}>
                  <p>
                    {message.body ||
                      message.file?.name ||
                      (message.poll_question ? `Poll: ${message.poll_question}` : null) ||
                      message.meeting?.title ||
                      message.contact?.full_name ||
                      'Attachment'}
                  </p>
                  <p className={styles.resultMeta}>
                    {message.author?.full_name ?? 'Former employee'} · {titles.get(message.conversation_id) ?? 'Conversation'} ·{' '}
                    {formatDateTime(message.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MessagesShell>
  );
}
