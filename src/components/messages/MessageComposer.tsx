'use client';

import { SendHorizontal, X } from 'lucide-react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import type { SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { checkUploadable, fileTypeOf } from '@/lib/files/fileTypes';
import { ChatAttachMenu } from './ChatAttachMenu';
import { requestPageRefresh, sendTyping, subscribeLive } from '@/lib/live/liveUpdates';
import { abandonUploadAction, finishUploadAction, startUploadAction } from '@/server/actions/fileActions';
import { sendMessageAction } from '@/server/actions/messageActions';
import styles from './MessageComposer.module.css';

type MessageComposerProps = {
  conversationId: string;
  myName: string;
  canPost: boolean;
  replyTo: { id: string; author: string; body: string } | null;
  // For the attach menu: colleagues to share as contacts, and what this person may do.
  people: SelectOption[];
  canShareLinks: boolean;
  canSchedule: boolean;
};

const typingTimeoutMs = 4000;

async function uploadAttachment(file: File) {
  const problem = checkUploadable(file);
  if (problem) throw new Error(problem);

  const started = await startUploadAction({ name: file.name, size: file.size });
  if (started.status === 'error') throw new Error(started.message);

  const response = await fetch(started.ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': fileTypeOf(file.name)?.mime ?? 'application/octet-stream', 'x-upsert': 'false' },
    body: file,
  });
  if (!response.ok) {
    await abandonUploadAction(started.ticket.fileId);
    throw new Error(`${file.name}: the upload failed. Please try again.`);
  }

  const finished = await finishUploadAction(started.ticket.versionId);
  if (finished.status === 'error') throw new Error(finished.message);
  return started.ticket.fileId;
}

// The composer, typing indicator and live updates. The server only sends this
// conversation's changes and typing signals to people who are in it.
export function MessageComposer({
  conversationId,
  myName,
  canPost,
  replyTo,
  people,
  canShareLinks,
  canSchedule,
}: MessageComposerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    function scheduleRefresh() {
      requestPageRefresh(() => router.refresh(), 200);
    }

    const unsubscribe = subscribeLive({
      topics: [
        { table: 'messages', column: 'conversation_id', value: conversationId },
        { table: 'conversation_reads', column: 'conversation_id', value: conversationId },
        { table: 'message_poll_votes', column: 'conversation_id', value: conversationId },
      ],
      typingConversationId: conversationId,
      // Catches anything that arrived while connecting.
      onReady: scheduleRefresh,
      onChange: scheduleRefresh,
      onTyping: ({ name }) => {
        if (!name || name === myName) return;
        setTypingNames((current) => (current.includes(name) ? current : [...current, name]));
        clearTimeout(typingTimers.get(name));
        typingTimers.set(
          name,
          setTimeout(() => setTypingNames((current) => current.filter((item) => item !== name)), typingTimeoutMs),
        );
      },
    });

    return () => {
      typingTimers.forEach((timer) => clearTimeout(timer));
      unsubscribe();
    };
  }, [conversationId, myName, router]);

  function announceTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    sendTyping(conversationId);
  }

  function send() {
    if (!body.trim() && !attachment) return;

    startTransition(async () => {
      try {
        const fileId = attachment ? await uploadAttachment(attachment) : null;
        const outcome = await sendMessageAction(conversationId, { body, replyToId: replyTo?.id ?? null, fileId });
        setResult(outcome);
        if (outcome.status === 'success') {
          setBody('');
          setAttachment(null);
          const box = document.getElementById('message-body');
          if (box) box.style.height = '';
          if (replyTo) router.replace(pathname, { scroll: false });
        }
      } catch (error) {
        setResult({ status: 'error', message: error instanceof Error ? error.message : 'The message could not be sent.' });
      }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  const typingText =
    typingNames.length === 0
      ? ' '
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : `${typingNames.length} people are typing…`;

  if (!canPost) {
    return <p className={styles.readOnly}>Only people who can post announcements can write here.</p>;
  }

  return (
    <div className={styles.composer}>
      <p className={styles.typing} aria-live="polite">
        {typingText}
      </p>
      {result.status === 'error' && <FormMessage result={result} />}
      {replyTo && (
        <div className={styles.chip}>
          <span>
            Replying to <strong>{replyTo.author}</strong>: {replyTo.body.slice(0, 80)}
          </span>
          <Link href={pathname} scroll={false} aria-label="Cancel reply" className={styles.chipClose}>
            <X size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
      {attachment && (
        <div className={styles.chip}>
          <span>Attached: {attachment.name}</span>
          <button type="button" className={styles.chipClose} aria-label="Remove attachment" onClick={() => setAttachment(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {/* The attach menu has its own forms, so it sits beside the message form, not in it. */}
      <div className={styles.form}>
        <ChatAttachMenu
          conversationId={conversationId}
          people={people}
          canShareLinks={canShareLinks}
          canSchedule={canSchedule}
          onFile={(file) => {
            const problem = checkUploadable(file);
            if (problem) setResult({ status: 'error', message: problem });
            else {
              setResult({ status: 'idle' });
              setAttachment(file);
            }
          }}
        />
        <form
          className={styles.messageForm}
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <label htmlFor="message-body" className={styles.hiddenLabel}>
            Message
          </label>
          <textarea
            id="message-body"
            className={styles.input}
            rows={1}
            value={body}
            placeholder="Type a message"
            title="Use @Full Name to mention someone. Shift and Enter starts a new line."
            onChange={(event) => {
              setBody(event.target.value);
              announceTyping();
              // One line to start with; grows with the text, up to a few lines.
              const box = event.target;
              box.style.height = 'auto';
              box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
            }}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" className={styles.send} disabled={isPending || (!body.trim() && !attachment)} aria-label="Send">
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
