'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { reactToMessageAction } from '@/server/actions/messageActions';
import styles from './MessageReactions.module.css';

export type ReactionView = { emoji: string; employeeId: string; name: string };

type MessageReactionsProps = {
  conversationId: string;
  messageId: string;
  reactions: ReactionView[];
  myEmployeeId: string;
  isMine: boolean;
};

// The reactions under a message: each emoji once, with how many people chose it.
// Tapping one you chose takes yours back; tapping another makes it yours.
export function MessageReactions({ conversationId, messageId, reactions, myEmployeeId, isMine }: MessageReactionsProps) {
  const [shown, setShown] = useOptimistic(reactions);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (shown.length === 0) return null;

  const mine = shown.find((reaction) => reaction.employeeId === myEmployeeId)?.emoji ?? null;
  const groups = new Map<string, string[]>();
  for (const reaction of shown) {
    const names = groups.get(reaction.emoji) ?? [];
    names.push(reaction.employeeId === myEmployeeId ? 'You' : reaction.name);
    groups.set(reaction.emoji, names);
  }

  function choose(emoji: string) {
    const next = mine === emoji ? '' : emoji;
    startTransition(async () => {
      setShown([
        ...shown.filter((reaction) => reaction.employeeId !== myEmployeeId),
        ...(next ? [{ emoji: next, employeeId: myEmployeeId, name: 'You' }] : []),
      ]);
      const outcome = await reactToMessageAction(conversationId, messageId, next);
      setError(outcome.status === 'error' ? (outcome.message ?? 'The reaction could not be saved.') : null);
    });
  }

  return (
    <div className={styles.reactions} data-mine={isMine}>
      {[...groups].map(([emoji, names]) => (
        <button
          key={emoji}
          type="button"
          className={styles.chip}
          aria-pressed={mine === emoji}
          disabled={isPending}
          title={names.join(', ')}
          aria-label={`${emoji} ${names.length}: ${names.join(', ')}`}
          onClick={() => choose(emoji)}
        >
          <span className={styles.emoji}>{emoji}</span>
          {names.length > 1 && <span className={styles.count}>{names.length}</span>}
        </button>
      ))}
      {error && (
        <span className={styles.error} role="status" onAnimationEnd={() => setError(null)}>
          {error}
        </span>
      )}
    </div>
  );
}
