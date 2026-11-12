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

const clockTime = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const calendarDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
const longDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// "Today at 8:43 pm", "Yesterday at 11:41 am" or "10 Nov 2026 at 9:05 am", in India time.
function infoTime(value: string, now: Date) {
  const at = new Date(value);
  const day = calendarDay.format(at);
  const yesterday = new Date(now.getTime() - 86_400_000);
  const label = day === calendarDay.format(now) ? 'Today' : day === calendarDay.format(yesterday) ? 'Yesterday' : longDay.format(at);
  return `${label} at ${clockTime.format(at).toLowerCase()}`;
}

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
export function MessageInfo({ messageId, body, sentAt }: { messageId: string; body: string; sentAt: string }) {
  const [info, setInfo] = useState<{ rows: MessageInfoRow[]; now: Date } | null>(null);
  useEffect(() => {
    let active = true;
    getMessageInfoAction(messageId).then((rows) => {
      if (active) setInfo({ rows, now: new Date() });
    });
    return () => {
      active = false;
    };
  }, [messageId]);

  const preview = (
    <div className={styles.infoMessage}>
      {body.trim() ? <p className={styles.infoBody}>{body}</p> : <p className={styles.muted}>Attachment</p>}
    </div>
  );
  if (!info) {
    return (
      <div className={styles.info}>
        {preview}
        <p className={styles.text}>Loading…</p>
      </div>
    );
  }

  const { rows, now } = info;
  const when = (value: string | null) => (value ? infoTime(value, now) : null);

  // One other person: WhatsApp's two lines, each with its time.
  if (rows.length === 1) {
    const person = rows[0]!;
    return (
      <div className={styles.info}>
        {preview}
        <p className={styles.muted}>Sent {infoTime(sentAt, now)}</p>
        <InfoLine icon={<CheckCheck size={18} className={styles.read} aria-hidden="true" />} label="Read" time={when(person.readAt) ?? '—'} />
        <InfoLine
          icon={<CheckCheck size={18} className={styles.delivered} aria-hidden="true" />}
          label="Delivered"
          time={when(person.deliveredAt) ?? (person.delivered ? 'Delivered' : '—')}
        />
      </div>
    );
  }

  const read = rows.filter((row) => row.readAt);
  const delivered = rows.filter((row) => !row.readAt && row.delivered);
  const waiting = rows.filter((row) => !row.readAt && !row.delivered);

  return (
    <div className={styles.info}>
      {preview}
      <p className={styles.muted}>Sent {infoTime(sentAt, now)}</p>
      <InfoGroup
        icon={<CheckCheck size={18} className={styles.read} aria-hidden="true" />}
        label="Read by"
        empty="Nobody yet"
        people={read.map((row) => ({ id: row.employeeId, name: row.name, time: when(row.readAt) }))}
      />
      <InfoGroup
        icon={<CheckCheck size={18} className={styles.delivered} aria-hidden="true" />}
        label="Delivered to"
        empty={read.length > 0 && waiting.length === 0 ? 'Everyone has read it' : 'Nobody yet'}
        people={delivered.map((row) => ({ id: row.employeeId, name: row.name, time: when(row.deliveredAt) }))}
      />
      {waiting.length > 0 && (
        <InfoGroup
          icon={<Check size={18} className={styles.delivered} aria-hidden="true" />}
          label="Not delivered yet"
          empty=""
          note="Delivered when they next open the CRM."
          people={waiting.map((row) => ({ id: row.employeeId, name: row.name, time: null }))}
        />
      )}
    </div>
  );
}

function InfoLine({ icon, label, time }: { icon: ReactNode; label: string; time: string }) {
  return (
    <section className={styles.infoLine}>
      <h3 className={styles.infoHeading}>
        {icon} {label}
      </h3>
      <p className={styles.infoTime}>{time}</p>
    </section>
  );
}

function InfoGroup({
  icon,
  label,
  empty,
  note,
  people,
}: {
  icon: ReactNode;
  label: string;
  empty: string;
  note?: string;
  people: { id: string; name: string; time: string | null }[];
}) {
  return (
    <section className={styles.infoLine}>
      <h3 className={styles.infoHeading}>
        {icon} {label}
      </h3>
      {note && <p className={styles.infoTime}>{note}</p>}
      {people.length === 0 ? (
        <p className={styles.infoTime}>{empty}</p>
      ) : (
        <ul className={styles.infoPeople}>
          {people.map((person) => (
            <li key={person.id} className={styles.infoPerson}>
              <span className={styles.infoName}>{person.name}</span>
              {person.time && <span className={styles.infoTime}>{person.time}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
