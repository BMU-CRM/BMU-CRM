import { Pin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageComposer } from '@/components/messages/MessageComposer';
import { MessagesShell } from '@/components/messages/MessagesShell';
import { MessageThread } from '@/components/messages/MessageThread';
import { ScrollToLatest } from '@/components/messages/ScrollToLatest';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { conversationKindLabels } from '@/lib/messages/conversationTitle';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import {
  getConversation,
  getReadState,
  listMessages,
  listMyConversations,
  listPinnedMessages,
  listPollVotes,
  listReadPositions,
  markConversationRead,
  type MessageItem,
} from '@/server/services/messageService';
import styles from '../MessagesLayout.module.css';

export const metadata: Metadata = { title: 'Messages' };

type ConversationPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ reply?: string }>;
};

// "Seen" under your latest message, from everyone else's read position.
function seenLabel(messages: MessageItem[], reads: Awaited<ReturnType<typeof listReadPositions>>, me: string, isDirect: boolean) {
  const mine = [...messages].reverse().find((message) => message.author_id === me && !message.deleted_at);
  if (!mine) return null;

  const seenBy = reads.filter((read) => read.employee_id !== me && read.last_read_at >= mine.created_at);
  if (seenBy.length === 0) return null;
  if (isDirect) return 'Seen';
  if (seenBy.length <= 3) return `Seen by ${seenBy.map((read) => read.employee?.full_name ?? 'someone').join(', ')}`;
  return `Seen by ${seenBy.length} people`;
}

export default async function ConversationPage({ params, searchParams }: ConversationPageProps) {
  const access = await requirePagePermission(permissionKeys.messagesUse);
  const conversationId = parseId((await params).conversationId);
  if (!conversationId) notFound();

  const conversation = await getConversation(conversationId, access.employee.id);
  if (!conversation) notFound();

  // Opening the conversation counts as reading it, and clears its notifications.
  await markConversationRead(conversationId);

  const [conversations, messages, pinned, reads, readState, pollVotes, people] = await Promise.all([
    listMyConversations(),
    listMessages(conversationId),
    listPinnedMessages(conversationId),
    listReadPositions(conversationId),
    getReadState(conversationId),
    listPollVotes(conversationId),
    listEmployeeOptions(),
  ]);
  const otherPerson = conversation.kind === 'direct' ? conversation.members.find((member) => member.id !== access.employee.id) : undefined;

  const replyId = parseId((await searchParams).reply);
  const replyMessage = replyId ? messages.find((message) => message.id === replyId && !message.deleted_at) : undefined;
  const canModerate =
    conversation.kind === 'announcement' && access.permissions[permissionKeys.messagesAnnounce] !== undefined;

  return (
    <MessagesShell conversations={conversations} activeId={conversationId}>
      <header className={styles.mainHeader}>
        <div>
          <Link href="/messages" className={styles.back}>
            ‹ All conversations
          </Link>
          <h1 className={styles.title}>{conversation.displayTitle}</h1>
          <p className={styles.subtitle}>
            {conversationKindLabels[conversation.kind]}
            {otherPerson && <PresenceDot employeeId={otherPerson.id} withLabel prefix="·" />}
            {conversation.kind === 'group' ? ` · ${conversation.members.length} members` : ''}
            {conversation.project_id && (
              <>
                {' · '}
                <Link href={`/projects/${conversation.project_id}`}>Open project</Link>
              </>
            )}
          </p>
        </div>
      </header>

      {pinned.length > 0 && (
        <div className={styles.pinnedBar}>
          {pinned.map((message) => (
            <a key={message.id} href={`#message-${message.id}`}>
              <Pin size={12} aria-label="Pinned" /> {message.author?.full_name ?? 'Former employee'}: {message.body}
            </a>
          ))}
        </div>
      )}

      <div className={styles.scroll} id="message-scroll">
        <ScrollToLatest containerId="message-scroll" messageCount={messages.length} />
        <MessageThread
          conversationId={conversationId}
          messages={messages}
          myEmployeeId={access.employee.id}
          canPost={conversation.canPost}
          canModerate={canModerate}
          showAuthorNames={conversation.kind !== 'direct'}
          readState={readState}
          pollVotes={pollVotes}
          seenLabel={seenLabel(messages, reads, access.employee.id, conversation.kind === 'direct')}
        />
      </div>

      <MessageComposer
        conversationId={conversationId}
        myName={access.employee.full_name}
        canPost={conversation.canPost}
        people={people.filter((person) => person.id !== access.employee.id).map((person) => ({ value: person.id, label: person.full_name }))}
        canShareLinks={access.permissions[permissionKeys.filesUpload] !== undefined}
        canSchedule={access.permissions[permissionKeys.meetingsCreate] !== undefined}
        replyTo={
          replyMessage
            ? { id: replyMessage.id, author: replyMessage.author?.full_name ?? 'Former employee', body: replyMessage.body }
            : null
        }
      />
    </MessagesShell>
  );
}
