import { Ban, BarChart3, FileText, Forward, Pin, Star } from 'lucide-react';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { datePartInIndia } from '@/lib/calendar/calendarRange';
import { formatDate, formatDateTime, todayInIndia } from '@/lib/formatDate';
import type { MessageItem, PollVote } from '@/server/services/messageService';
import type { ForwardTarget } from './ChatDialogs';
import { ChatSelectionProvider, SelectBox } from './ChatSelection';
import { ContactCard, EventCard, MessageAttachment, PollCard } from './MessageCards';
import { MessageMenu } from './MessageMenu';
import styles from './MessageThread.module.css';

type MessageThreadProps = {
  conversationId: string;
  messages: MessageItem[];
  myEmployeeId: string;
  canPost: boolean;
  canModerate: boolean;
  // Direct chats leave out names; everyone knows who is talking.
  showAuthorNames: boolean;
  // When everyone else had received and read up to, for the ticks on your messages.
  readState: { others: number; everyoneReadAt: string | null; everyoneDeliveredAt: string | null };
  seenLabel: string | null;
  pollVotes: PollVote[];
  // Conversations a message can be forwarded to.
  forwardTargets: ForwardTarget[];
};

const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

// In groups each person's name has its own colour, as in WhatsApp.
const nameColours = ['#06cf9c', '#53bdeb', '#ff8f6b', '#c48cf0', '#f5b700', '#ef6a9a', '#7fcb6b', '#5ec3c9'];

function nameColour(id: string | null | undefined) {
  if (!id) return nameColours[0];
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return nameColours[hash % nameColours.length];
}

// Room kept at the end of the last line for the time and ticks, so they never overlap
// the text: about 54px for the time, plus the ticks, the "Edited" word and a star.
function metaWidth(message: MessageItem, isMine: boolean) {
  return 54 + (isMine ? 21 : 0) + (message.edited_at ? 40 : 0) + (message.isStarred ? 14 : 0);
}

function dayLabel(day: string, today: string) {
  if (day === today) return 'Today';
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return formatDate(day);
}

// WhatsApp-style ticks: one grey tick once sent, two grey once it has reached everyone,
// two green once everyone has read it.
function Ticks({ state }: { state: 'sent' | 'delivered' | 'read' }) {
  const label = { sent: 'Sent', delivered: 'Delivered', read: 'Read' }[state];
  return (
    <svg className={styles.ticks} data-state={state} viewBox="0 0 18 12" width="18" height="12" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M1.5 6.6 4.9 10 11.6 2" />
      {state !== 'sent' && <path d="M8.2 9.4 8.8 10 15.6 2" />}
    </svg>
  );
}

function ReplyPreview({ reply, myEmployeeId }: { reply: NonNullable<MessageItem['reply']>; myEmployeeId: string }) {
  const author = reply.author?.id === myEmployeeId ? 'You' : (reply.author?.full_name ?? 'Former employee');
  let content;
  if (reply.deleted_at) content = <span className={styles.replyMuted}>This message was deleted</span>;
  else if (reply.file)
    content = (
      <span className={styles.replyFile}>
        <FileText size={14} aria-hidden="true" /> {reply.file.name}
      </span>
    );
  else if (reply.poll_question)
    content = (
      <span className={styles.replyFile}>
        <BarChart3 size={14} aria-hidden="true" /> {reply.poll_question}
      </span>
    );
  else content = <span className={styles.replyBody}>{reply.body || 'Attachment'}</span>;

  return (
    <a href={`#message-${reply.id}`} className={styles.reply}>
      <span className={styles.replyAuthor}>{author}</span>
      {content}
    </a>
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
  forwardTargets,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return <p className={styles.empty}>No messages yet. Say hello.</p>;
  }

  const today = todayInIndia();
  const lastOwnMessageId = [...messages].reverse().find((message) => message.author_id === myEmployeeId)?.id;
  const readUpTo = readState.everyoneReadAt ? new Date(readState.everyoneReadAt).getTime() : null;
  const deliveredUpTo = readState.everyoneDeliveredAt ? new Date(readState.everyoneDeliveredAt).getTime() : null;

  const selectable = messages
    .filter((message) => !message.deleted_at)
    .map((message) => ({
      id: message.id,
      canForward: !message.poll_question,
      // Checked again by the database when it happens.
      canDeleteForEveryone: (message.author_id === myEmployeeId && message.isChangeableNow) || canModerate,
    }));

  return (
    <ChatSelectionProvider conversationId={conversationId} messages={selectable} targets={forwardTargets}>
      <ol className={styles.thread}>
        {messages.map((message, index) => {
          const isMine = message.author_id === myEmployeeId;
          const isDeleted = message.deleted_at !== null;
          const day = datePartInIndia(message.created_at);
          const previous = messages[index - 1];
          const startsDay = !previous || datePartInIndia(previous.created_at) !== day;
          // Consecutive messages from one person group under one name and avatar.
          const continues = !startsDay && previous?.author_id === message.author_id;
          const sentAt = new Date(message.created_at).getTime();
          const tickState =
            readState.others > 0 && readUpTo !== null && sentAt <= readUpTo
              ? 'read'
              : readState.others > 0 && deliveredUpTo !== null && sentAt <= deliveredUpTo
                ? 'delivered'
                : 'sent';

          return (
            <li key={message.id} className={styles.row}>
              {startsDay && (
                <p className={styles.day}>
                  <span>{dayLabel(day, today)}</span>
                </p>
              )}
              <div
                id={`message-${message.id}`}
                className={styles.message}
                data-mine={isMine}
                data-continues={continues}
                data-search-text={isDeleted ? undefined : message.body.toLowerCase()}
              >
                {!isDeleted && <SelectBox messageId={message.id} />}
                {!isMine && showAuthorNames && (
                  <span className={styles.avatar} aria-hidden={continues}>
                    {!continues && (
                      <>
                        <PersonAvatar name={message.author?.full_name ?? '?'} size="small" />
                        <PresenceDot employeeId={message.author?.id} variant="overlay" />
                      </>
                    )}
                  </span>
                )}

                <div
                  className={styles.bubble}
                  data-deleted={isDeleted}
                  // Text ends the bubble, so the time can sit at the end of its last line.
                  data-inline-meta={Boolean((isDeleted || message.body) && !(message.id === lastOwnMessageId && seenLabel && showAuthorNames))}
                  style={{ '--meta-width': `${metaWidth(message, isMine)}px` } as React.CSSProperties}
                >
                  {!isDeleted && (
                    <MessageMenu
                      conversationId={conversationId}
                      messageId={message.id}
                      body={message.body}
                      sentAt={message.created_at}
                      isMine={isMine}
                      isPinned={message.pinned_at !== null}
                      isStarred={message.isStarred}
                      isEditableKind={!message.poll_question && !message.meeting_id && !message.contact_employee_id && message.body.length > 0}
                      canForward={!message.poll_question}
                      canModerate={canModerate}
                      changeableUntil={message.changeableUntil}
                      canPost={canPost}
                      targets={forwardTargets}
                    />
                  )}
                  {!isMine && showAuthorNames && !continues && (
                    <p className={styles.author} style={{ color: nameColour(message.author?.id) }}>
                      {message.author?.full_name ?? 'Former employee'}
                    </p>
                  )}
                  {message.forwarded && !isDeleted && (
                    <p className={styles.forwarded}>
                      <Forward size={12} aria-hidden="true" /> Forwarded
                    </p>
                  )}
                  {message.pinned_at && (
                    <p className={styles.pinned}>
                      <Pin size={12} aria-hidden="true" /> Pinned
                    </p>
                  )}

                  {message.reply && !isDeleted && <ReplyPreview reply={message.reply} myEmployeeId={myEmployeeId} />}

                  {isDeleted ? (
                    <p className={styles.deleted}>
                      <Ban size={14} aria-hidden="true" />
                      {isMine ? 'You deleted this message' : 'This message was deleted'}
                    </p>
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
                    {message.isStarred && !isDeleted && <Star size={11} className={styles.star} aria-label="Starred" />}
                    {message.edited_at && !isDeleted && <span>Edited</span>}
                    <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>
                      {clock.format(new Date(message.created_at))}
                    </time>
                    {isMine && !isDeleted && <Ticks state={tickState} />}
                  </p>
                  {/* In groups and channels, who has seen your latest message. */}
                  {message.id === lastOwnMessageId && seenLabel && showAuthorNames && (
                    <p className={styles.seenBy}>{seenLabel}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </ChatSelectionProvider>
  );
}
