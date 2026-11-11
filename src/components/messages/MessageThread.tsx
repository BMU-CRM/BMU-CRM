import { Check, CheckCheck, Pin } from 'lucide-react';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { datePartInIndia } from '@/lib/calendar/calendarRange';
import { formatDate, formatDateTime, todayInIndia } from '@/lib/formatDate';
import type { MessageItem, PollVote } from '@/server/services/messageService';
import { ContactCard, EventCard, MessageAttachment, PollCard } from './MessageCards';
import { MessageItemActions } from './MessageItemActions';
import styles from './MessageThread.module.css';

type MessageThreadProps = {
  conversationId: string;
  messages: MessageItem[];
  myEmployeeId: string;
  canPost: boolean;
  canModerate: boolean;
  // Direct chats leave out names; everyone knows who is talking.
  showAuthorNames: boolean;
  // When everyone else had read up to, for the ticks on your own messages.
  readState: { others: number; everyoneReadAt: string | null };
  seenLabel: string | null;
  pollVotes: PollVote[];
};

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' });

function dayLabel(day: string, today: string) {
  if (day === today) return 'Today';
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return formatDate(day);
}

// Two grey ticks once sent; light green once everyone else in the conversation has read it.
function Ticks({ seen, others }: { seen: boolean; others: number }) {
  if (others === 0) {
    return (
      <span className={styles.ticks} title="Sent">
        <Check size={15} aria-label="Sent" />
      </span>
    );
  }
  return (
    <span className={styles.ticks} data-seen={seen} title={seen ? 'Seen' : 'Sent'}>
      <CheckCheck size={15} aria-label={seen ? 'Seen' : 'Sent'} />
    </span>
  );
}

export function MessageThread({
  conversationId,
  messages,
  myEmployeeId,
  canPost,
  canModerate,
  showAuthorNames,
  readState,
  seenLabel,
  pollVotes,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return <p className={styles.empty}>No messages yet. Say hello.</p>;
  }

  const today = todayInIndia();
  const lastOwnMessageId = [...messages].reverse().find((message) => message.author_id === myEmployeeId)?.id;
  const everyoneReadAt = readState.everyoneReadAt ? new Date(readState.everyoneReadAt).getTime() : null;

  return (
    <ol className={styles.thread}>
      {messages.map((message, index) => {
        const isMine = message.author_id === myEmployeeId;
        const isDeleted = message.deleted_at !== null;
        const day = datePartInIndia(message.created_at);
        const previous = messages[index - 1];
        const startsDay = !previous || datePartInIndia(previous.created_at) !== day;
        // Consecutive messages from one person group under one name and avatar.
        const continues = !startsDay && previous?.author_id === message.author_id;
        const seen = everyoneReadAt !== null && new Date(message.created_at).getTime() <= everyoneReadAt;

        return (
          <li key={message.id} className={styles.row}>
            {startsDay && (
              <p className={styles.day}>
                <span>{dayLabel(day, today)}</span>
              </p>
            )}
            <div id={`message-${message.id}`} className={styles.message} data-mine={isMine} data-continues={continues}>
              {!isMine && (
                <span className={styles.avatar} aria-hidden={continues}>
                  {!continues && (
                    <>
                      <PersonAvatar name={message.author?.full_name ?? '?'} size="small" />
                      <PresenceDot employeeId={message.author?.id} variant="overlay" />
                    </>
                  )}
                </span>
              )}

              <div className={styles.bubble}>
                {!isMine && showAuthorNames && !continues && (
                  <p className={styles.author}>{message.author?.full_name ?? 'Former employee'}</p>
                )}
                {message.pinned_at && (
                  <p className={styles.pinned}>
                    <Pin size={12} aria-hidden="true" /> Pinned
                  </p>
                )}

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
                    {message.poll_question && (
                      <PollCard
                        conversationId={conversationId}
                        message={message}
                        votes={pollVotes.filter((vote) => vote.message_id === message.id)}
                        myEmployeeId={myEmployeeId}
                        canVote={canPost}
                      />
                    )}
                    {message.meeting_id && <EventCard meeting={message.meeting} isOver={message.meetingIsOver} />}
                    {message.contact && <ContactCard contact={message.contact} />}
                    {message.file && <MessageAttachment file={message.file} />}
                    {message.body && <p className={styles.body}>{message.body}</p>}
                  </>
                )}

                <p className={styles.meta}>
                  {message.edited_at && !isDeleted && <span>edited</span>}
                  <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>
                    {clock.format(new Date(message.created_at))}
                  </time>
                  {isMine && !isDeleted && <Ticks seen={seen} others={readState.others} />}
                </p>
                {/* In groups and channels, who has seen your latest message. */}
                {message.id === lastOwnMessageId && seenLabel && showAuthorNames && (
                  <p className={styles.seenBy}>{seenLabel}</p>
                )}
              </div>

              {!isDeleted && canPost && (
                <MessageItemActions
                  conversationId={conversationId}
                  messageId={message.id}
                  body={message.body}
                  isPinned={message.pinned_at !== null}
                  canEdit={isMine && !message.poll_question && !message.meeting_id && !message.contact_employee_id}
                  canDelete={isMine || canModerate}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
