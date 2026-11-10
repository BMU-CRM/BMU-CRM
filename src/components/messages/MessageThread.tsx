import { FileText, Pin } from 'lucide-react';
import Link from 'next/link';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { formatFileSize } from '@/lib/files/fileTypes';
import { formatDateTime } from '@/lib/formatDate';
import type { MessageItem } from '@/server/services/messageService';
import { MessageItemActions } from './MessageItemActions';
import styles from './MessageThread.module.css';

type MessageThreadProps = {
  conversationId: string;
  messages: MessageItem[];
  myEmployeeId: string;
  canPost: boolean;
  canModerate: boolean;
  seenLabel: string | null;
};

export function MessageThread({ conversationId, messages, myEmployeeId, canPost, canModerate, seenLabel }: MessageThreadProps) {
  if (messages.length === 0) {
    return <p className={styles.empty}>No messages yet. Say hello.</p>;
  }

  const lastOwnMessageId = [...messages].reverse().find((message) => message.author_id === myEmployeeId)?.id;

  return (
    <ol className={styles.thread}>
      {messages.map((message) => {
        const isMine = message.author_id === myEmployeeId;
        const isDeleted = message.deleted_at !== null;

        return (
          <li key={message.id} id={`message-${message.id}`} className={styles.message}>
            <PersonAvatar name={message.author?.full_name ?? '?'} size="small" />
            <div className={styles.content}>
              <p className={styles.heading}>
                <span className={styles.author}>{message.author?.full_name ?? 'Former employee'}</span>
                <time className={styles.time} dateTime={message.created_at}>
                  {formatDateTime(message.created_at)}
                </time>
                {message.edited_at && !isDeleted && <span className={styles.time}>(edited)</span>}
                {message.pinned_at && (
                  <span className={styles.pinned}>
                    <Pin size={12} aria-hidden="true" /> Pinned
                  </span>
                )}
              </p>

              {message.reply && (
                <a href={`#message-${message.reply.id}`} className={styles.reply}>
                  <span className={styles.replyAuthor}>{message.reply.author?.full_name ?? 'Former employee'}</span>
                  <span className={styles.replyBody}>{message.reply.deleted_at ? 'Message deleted' : message.reply.body}</span>
                </a>
              )}

              {isDeleted ? (
                <p className={styles.deleted}>This message was deleted.</p>
              ) : (
                <>
                  {message.body && <p className={styles.body}>{message.body}</p>}
                  {message.file && message.file.status === 'ready' && (
                    <Link href={`/files/${message.file.id}`} className={styles.file}>
                      <FileText size={16} aria-hidden="true" />
                      <span>{message.file.name}</span>
                      {message.file.kind === 'upload' && <span className={styles.time}>{formatFileSize(message.file.size_bytes)}</span>}
                    </Link>
                  )}
                </>
              )}

              {message.id === lastOwnMessageId && seenLabel && <p className={styles.seen}>{seenLabel}</p>}
            </div>

            {!isDeleted && canPost && (
              <MessageItemActions
                conversationId={conversationId}
                messageId={message.id}
                body={message.body}
                isPinned={message.pinned_at !== null}
                canEdit={isMine}
                canDelete={isMine || canModerate}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
