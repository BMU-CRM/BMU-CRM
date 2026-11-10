'use client';

import { Pencil, Pin, PinOff, Reply, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { deleteMessageAction, editMessageAction, setMessagePinnedAction } from '@/server/actions/messageActions';
import styles from './MessageItemActions.module.css';

type MessageItemActionsProps = {
  conversationId: string;
  messageId: string;
  body: string;
  isPinned: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function MessageItemActions({ conversationId, messageId, body, isPinned, canEdit, canDelete }: MessageItemActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === 'success') after?.();
    });
  }

  if (isEditing) {
    return (
      <form
        className={styles.editor}
        onSubmit={(event) => {
          event.preventDefault();
          run(() => editMessageAction(conversationId, messageId, draft), () => setIsEditing(false));
        }}
      >
        <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
        <label htmlFor={`edit-${messageId}`} className={styles.hiddenLabel}>
          Edit message
        </label>
        <textarea id={`edit-${messageId}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className={styles.textarea} />
        <div className={styles.editorActions}>
          <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.actions}>
      {result.status === 'error' && <FormMessage result={result} />}
      <button
        type="button"
        className={styles.icon}
        onClick={() => router.push(`${pathname}?reply=${messageId}`, { scroll: false })}
        aria-label="Reply"
        title="Reply"
      >
        <Reply size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.icon}
        disabled={isPending}
        onClick={() => run(() => setMessagePinnedAction(conversationId, messageId, !isPinned))}
        aria-label={isPinned ? 'Unpin' : 'Pin'}
        title={isPinned ? 'Unpin' : 'Pin'}
      >
        {isPinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
      </button>
      {canEdit && (
        <button type="button" className={styles.icon} onClick={() => setIsEditing(true)} aria-label="Edit" title="Edit">
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className={styles.icon}
          disabled={isPending}
          onClick={() => {
            if (window.confirm('Delete this message? Everyone in the conversation will see that it was deleted.')) {
              run(() => deleteMessageAction(conversationId, messageId));
            }
          }}
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
