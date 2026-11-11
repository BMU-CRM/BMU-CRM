'use client';

import { Check, CheckCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import type { ActionResult } from '@/lib/actionResult';
import {
  deleteMessagesForEveryoneAction,
  forwardMessagesAction,
  getMessageInfoAction,
  hideMessagesAction,
  type MessageInfoRow,
} from '@/server/actions/messageActions';
import styles from './ChatDialogs.module.css';

export type ForwardTarget = { value: string; label: string };

const infoTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

// A modal window that opens while `open` is true.
export function ChatDialog({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`${dialogStyles.dialog} ${styles.dialog}`} aria-label={title} onClose={onClose}>
      <div className={styles.head}>
        <h2 className={dialogStyles.title}>{title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

function useRun(onDone: () => void) {
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === 'success') onDone();
    });
  }
  return { result, isPending, run };
}

export function ForwardForm({ messageIds, targets, onDone }: { messageIds: string[]; targets: ForwardTarget[]; onDone: () => void }) {
  const { result, isPending, run } = useRun(onDone);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = new FormData(event.currentTarget).getAll('conversationIds').map(String);
        run(() => forwardMessagesAction(messageIds, chosen));
      }}
    >
      <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
      <SearchableMultiSelect
        id="forward-to"
        name="conversationIds"
        label="Forward to"
        options={targets}
        hint={`${messageIds.length} ${messageIds.length === 1 ? 'message' : 'messages'}. Polls are not forwarded.`}
      />
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Forwarding…' : 'Forward'}
        </Button>
      </div>
    </form>
  );
}

// Delete for me always; delete for everyone only when every chosen message allows it.
export function DeleteForm({
  conversationId,
  messageIds,
  canDeleteForEveryone,
  onDone,
}: {
  conversationId: string;
  messageIds: string[];
  canDeleteForEveryone: boolean;
  onDone: () => void;
}) {
  const { result, isPending, run } = useRun(onDone);
  return (
    <div className={styles.form}>
      <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
      <p className={styles.text}>
        {messageIds.length === 1 ? 'Delete this message?' : `Delete ${messageIds.length} messages?`}
        {!canDeleteForEveryone && ' Deleting for everyone is possible for your own messages within 5 minutes of sending.'}
      </p>
      <div className={styles.stackedActions}>
        {canDeleteForEveryone && (
          <Button variant="danger" disabled={isPending} onClick={() => run(() => deleteMessagesForEveryoneAction(conversationId, messageIds))}>
            Delete for everyone
          </Button>
        )}
        <Button disabled={isPending} onClick={() => run(() => hideMessagesAction(conversationId, messageIds))}>
          Delete for me
        </Button>
        <Button variant="ghost" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Who your message reached and who has read it, as in WhatsApp's message info.
export function MessageInfo({ messageId }: { messageId: string }) {
  const [rows, setRows] = useState<MessageInfoRow[] | null>(null);
  useEffect(() => {
    let active = true;
    getMessageInfoAction(messageId).then((info) => {
      if (active) setRows(info);
    });
    return () => {
      active = false;
    };
  }, [messageId]);

  if (!rows) return <p className={styles.text}>Loading…</p>;

  const read = rows.filter((row) => row.readAt);
  const delivered = rows.filter((row) => !row.readAt && row.delivered);
  const waiting = rows.filter((row) => !row.readAt && !row.delivered);

  return (
    <div className={styles.info}>
      <section>
        <h3 className={styles.infoHeading}>
          <CheckCheck size={16} className={styles.read} aria-hidden="true" /> Read by
        </h3>
        {read.length === 0 ? (
          <p className={styles.muted}>Nobody yet</p>
        ) : (
          <ul>
            {read.map((row) => (
              <li key={row.employeeId} className={styles.infoRow}>
                <span>{row.name}</span>
                <time className={styles.muted}>{infoTime.format(new Date(row.readAt as string))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className={styles.infoHeading}>
          <CheckCheck size={16} className={styles.delivered} aria-hidden="true" /> Delivered to
        </h3>
        {delivered.length === 0 ? (
          <p className={styles.muted}>{read.length > 0 && waiting.length === 0 ? 'Everyone has read it' : 'Nobody else yet'}</p>
        ) : (
          <ul>
            {delivered.map((row) => (
              <li key={row.employeeId} className={styles.infoRow}>
                <span>{row.name}</span>
                <span className={styles.muted}>Not read yet</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {waiting.length > 0 && (
        <section>
          <h3 className={styles.infoHeading}>
            <Check size={16} className={styles.delivered} aria-hidden="true" /> Not delivered yet
          </h3>
          <ul>
            {waiting.map((row) => (
              <li key={row.employeeId} className={styles.infoRow}>
                <span>{row.name}</span>
                <span className={styles.muted}>Has not opened the CRM since</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
