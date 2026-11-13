import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { MessagesShell } from '@/components/messages/MessagesShell';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDateTime } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { listMyConversations, searchMessages } from '@/server/services/messageService';
import styles from './MessagesLayout.module.css';

export const metadata: Metadata = { title: 'Messages' };

type MessagesPageProps = {
  searchParams: Promise<{ search?: string }>;
};

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  await requirePagePermission(permissionKeys.messagesUse);
  const { search } = await searchParams;

  const [conversations, results] = await Promise.all([
    listMyConversations(),
    search ? searchMessages(search) : Promise.resolve(null),
  ]);
  const titles = new Map(conversations.map((conversation) => [conversation.id, conversation.displayTitle]));

  return (
    <MessagesShell conversations={conversations} search={search}>
      {results === null ? (
        <p className={styles.placeholder}>Choose a conversation, or start a new one.</p>
      ) : (
        <>
          <header className={styles.mainHeader}>
            <div>
              <h1 className={styles.title}>Search results</h1>
              <p className={styles.subtitle}>
                {results.length} {results.length === 1 ? 'message' : 'messages'} matching “{search}”
              </p>
            </div>
          </header>
          <div className={styles.scroll}>
            {results.length === 0 ? (
              <p className={styles.placeholder}>No messages found.</p>
            ) : (
              <ul className={styles.results}>
                {results.map((result) => (
                  <li key={result.id}>
                    <Link href={`/messages/${result.conversation_id}#message-${result.id}`} className={styles.result}>
                      <p>{result.body}</p>
                      <p className={styles.resultMeta}>
                        {result.author?.full_name ?? 'Former employee'} · {titles.get(result.conversation_id) ?? 'Conversation'} ·{' '}
                        {formatDateTime(result.created_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </MessagesShell>
  );
}
