'use client';

import { Forward, Star, Trash2, X } from 'lucide-react';
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from 'react';
import { setMessageStarredAction } from '@/server/actions/messageActions';
import { ChatDialog, DeleteForm, ForwardForm, type ForwardTarget } from './ChatDialogs';
import styles from './ChatSelection.module.css';

// What the selection bar needs to know about each message.
export type SelectableMessage = { id: string; canDeleteForEveryone: boolean; canForward: boolean };

type SelectionState = {
  selecting: boolean;
  selected: Set<string>;
  start: (messageId: string) => void;
  toggle: (messageId: string) => void;
  stop: () => void;
};

const SelectionContext = createContext<SelectionState | null>(null);

export function useChatSelection() {
  return useContext(SelectionContext);
}

// Lets someone tick several messages, as WhatsApp's Select does, then forward, star or
// delete them together.
export function ChatSelectionProvider({
  conversationId,
  messages,
  targets,
  children,
}: {
  conversationId: string;
  messages: SelectableMessage[];
  targets: ForwardTarget[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [dialog, setDialog] = useState<'forward' | 'delete' | null>(null);
  const [isPending, startTransition] = useTransition();

  const state = useMemo<SelectionState>(
    () => ({
      selecting,
      selected,
      start: (messageId) => {
        setSelecting(true);
        setSelected(new Set([messageId]));
      },
      toggle: (messageId) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(messageId)) next.delete(messageId);
          else next.add(messageId);
          return next;
        }),
      stop: () => {
        setSelecting(false);
        setSelected(new Set());
      },
    }),
    [selected, selecting],
  );

  const chosen = messages.filter((message) => selected.has(message.id));
  const ids = chosen.map((message) => message.id);
  const close = () => {
    setDialog(null);
    state.stop();
  };

  return (
    <SelectionContext.Provider value={state}>
      {children}
      {selecting && (
        <div className={styles.bar} role="toolbar" aria-label="Selected messages">
          <button type="button" className={styles.icon} onClick={state.stop} aria-label="Cancel selection">
            <X size={18} aria-hidden="true" />
          </button>
          <span className={styles.count}>{ids.length} selected</span>
          <button
            type="button"
            className={styles.icon}
            disabled={ids.length === 0 || isPending}
            onClick={() =>
              startTransition(async () => {
                for (const id of ids) await setMessageStarredAction(conversationId, id, true);
                state.stop();
              })
            }
            aria-label="Star"
            title="Star"
          >
            <Star size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.icon}
            disabled={ids.length === 0 || !chosen.some((message) => message.canForward)}
            onClick={() => setDialog('forward')}
            aria-label="Forward"
            title="Forward"
          >
            <Forward size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.icon}
            disabled={ids.length === 0}
            onClick={() => setDialog('delete')}
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <ChatDialog title="Forward messages" open={dialog === 'forward'} onClose={() => setDialog(null)}>
        <ForwardForm messageIds={ids} targets={targets} onDone={close} />
      </ChatDialog>
      <ChatDialog title="Delete messages" open={dialog === 'delete'} onClose={() => setDialog(null)}>
        <DeleteForm
          conversationId={conversationId}
          messageIds={ids}
          canDeleteForEveryone={chosen.length > 0 && chosen.every((message) => message.canDeleteForEveryone)}
          onDone={close}
        />
      </ChatDialog>
    </SelectionContext.Provider>
  );
}

// The tick box beside each message while selecting.
export function SelectBox({ messageId }: { messageId: string }) {
  const selection = useChatSelection();
  if (!selection?.selecting) return null;
  return (
    <input
      type="checkbox"
      className={styles.checkbox}
      checked={selection.selected.has(messageId)}
      onChange={() => selection.toggle(messageId)}
      aria-label="Select message"
    />
  );
}
