'use client';

import { FaceSlightlySmiling, SendHorizontal, Sticker, X } from 'lucide-react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import type { SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { checkUploadable } from '@/lib/files/fileTypes';
import { uploadFromDevice } from '@/lib/files/uploadFromDevice';
import { ChatAttachMenu } from './ChatAttachMenu';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { requestPageRefresh, sendTyping, subscribeLive } from '@/lib/live/liveUpdates';
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
  // GIFs and stickers need a GIPHY key on the server; without one the button is left out.
  canSendGifs: boolean;
};

const typingTimeoutMs = 4000;

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
  canSendGifs,
}: MessageComposerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [body, setBody] = useState('');
  const [panel, setPanel] = useState<'emoji' | 'gif' | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
        { table: 'message_reactions', column: 'conversation_id', value: conversationId },
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

  // The emoji and GIF panel closes on Escape or a tap anywhere outside the composer.
  useEffect(() => {
    if (!panel) return;
    const onPointer = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) setPanel(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  function resizeBox(box: HTMLTextAreaElement) {
    // One line to start with; grows with the text, up to a few lines.
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }

  // Puts the emoji where the cursor is, and keeps the cursor just after it.
  function insertEmoji(emoji: string) {
    const box = inputRef.current;
    const start = box?.selectionStart ?? body.length;
    const end = box?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    if (next.length > 8000) return;
    setBody(next);
    announceTyping();
    requestAnimationFrame(() => {
      if (!box) return;
      const caret = start + emoji.length;
      box.setSelectionRange(caret, caret);
      resizeBox(box);
    });
  }

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
        const fileId = attachment ? await uploadFromDevice(attachment) : null;
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
    <div className={styles.composer} ref={composerRef}>
      {panel && (
        <div className={styles.panel}>
          {panel === 'emoji' ? (
            <EmojiPicker label="Add an emoji" onPick={insertEmoji} />
          ) : (
            <GifPicker
              conversationId={conversationId}
              replyToId={replyTo?.id ?? null}
              onSent={() => {
                setPanel(null);
                if (replyTo) router.replace(pathname, { scroll: false });
              }}
            />
          )}
        </div>
      )}
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
          <button
            type="button"
            className={styles.tool}
            aria-label="Emoji"
            title="Emoji"
            aria-expanded={panel === 'emoji'}
            onClick={() => setPanel((current) => (current === 'emoji' ? null : 'emoji'))}
          >
            <FaceSlightlySmiling size={20} aria-hidden="true" />
          </button>
          {canSendGifs && (
            <button
              type="button"
              className={styles.tool}
              aria-label="GIFs and stickers"
              title="GIFs and stickers"
              aria-expanded={panel === 'gif'}
              onClick={() => setPanel((current) => (current === 'gif' ? null : 'gif'))}
            >
              <Sticker size={20} aria-hidden="true" />
            </button>
          )}
          <label htmlFor="message-body" className={styles.hiddenLabel}>
            Message
          </label>
          <textarea
            id="message-body"
            ref={inputRef}
            className={styles.input}
            rows={1}
            value={body}
            placeholder="Type a message"
            title="Use @Full Name to mention someone. Shift and Enter starts a new line."
            onChange={(event) => {
              setBody(event.target.value);
              announceTyping();
              resizeBox(event.target);
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
