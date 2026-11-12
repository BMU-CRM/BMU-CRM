'use client';

import { CheckSquare, ChevronDown, Copy, Forward, Info, Pencil, Pin, PinOff, Reply, Star, StarOff, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { editMessageAction, setMessagePinnedAction, setMessageStarredAction } from '@/server/actions/messageActions';
import { ChatDialog, DeleteForm, ForwardForm, MessageInfo, type ForwardTarget } from './ChatDialogs';
import { useChatSelection } from './ChatSelection';
import styles from './MessageMenu.module.css';

type MessageMenuProps = {
  conversationId: string;
  messageId: string;
  body: string;
  sentAt: string;
  isMine: boolean;
  isPinned: boolean;
  isStarred: boolean;
  // Text-only messages of your own can be edited.
  isEditableKind: boolean;
  canForward: boolean;
  // A moderator may delete announcements for everyone at any time.
  canModerate: boolean;
  // Until when the author may edit it or delete it for everyone (milliseconds).
  changeableUntil: number;
  canPost: boolean;
  targets: ForwardTarget[];
};

// WhatsApp's message menu: Message info, Reply, Copy, Forward, Pin, Star, Edit, Select
// and Delete. Edit and delete for everyone stay available for 5 minutes after sending.
export function MessageMenu(props: MessageMenuProps) {
  const { conversationId, messageId, body, isMine, isPinned, isStarred, canPost, targets } = props;
  const router = useRouter();
  const pathname = usePathname();
  const selection = useChatSelection();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'info' | 'forward' | 'delete' | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  // Read when the menu opens, so the 5-minute window is checked at that moment.
  const [openedAt, setOpenedAt] = useState(0);
  // Where a right-click opened the menu; null when the ⌄ opened it.
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selecting = Boolean(selection?.selecting);

  // Right-clicking anywhere on the message opens the same menu at the pointer, as in
  // WhatsApp. With text selected, the browser's own menu stays, so copying still works.
  useEffect(() => {
    const bubble = menuRef.current?.parentElement;
    if (!bubble || selecting || editing) return;
    const onContextMenu = (event: MouseEvent) => {
      if (window.getSelection()?.toString().trim()) return;
      if ((event.target as HTMLElement).closest('a, input, textarea, button[data-native-menu]')) return;
      event.preventDefault();
      setOpenedAt(Date.now());
      setPoint({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 380)),
      });
      setOpen(true);
    };
    bubble.addEventListener('contextmenu', onContextMenu);
    return () => bubble.removeEventListener('contextmenu', onContextMenu);
  }, [selecting, editing]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // A menu placed at the pointer would drift away from its message on scroll.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const inTime = openedAt > 0 && openedAt <= props.changeableUntil;
  const canEdit = isMine && props.isEditableKind && inTime;
  const canDeleteForEveryone = (isMine && inTime) || props.canModerate;

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setOpen(false);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === 'success') after?.();
    });
  }

  if (selecting) return null;

  if (editing) {
    return (
      <form
        className={styles.editor}
        data-mine={isMine}
        onSubmit={(event) => {
          event.preventDefault();
          run(() => editMessageAction(conversationId, messageId, draft), () => setEditing(false));
        }}
      >
        <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
        <label htmlFor={`edit-${messageId}`} className={styles.hiddenLabel}>
          Edit message
        </label>
        <textarea id={`edit-${messageId}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} className={styles.textarea} autoFocus />
        <div className={styles.editorActions}>
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  const items: { key: string; label: string; icon: React.ReactNode; onSelect: () => void; show: boolean; danger?: boolean }[] = [
    { key: 'info', label: 'Message info', icon: <Info size={16} />, onSelect: () => (setOpen(false), setDialog('info')), show: isMine },
    {
      key: 'reply',
      label: 'Reply',
      icon: <Reply size={16} />,
      onSelect: () => (setOpen(false), router.push(`${pathname}?reply=${messageId}`, { scroll: false })),
      show: canPost,
    },
    {
      key: 'copy',
      label: 'Copy',
      icon: <Copy size={16} />,
      onSelect: () => {
        setOpen(false);
        void navigator.clipboard?.writeText(body).then(
          () => setResult({ status: 'success', message: 'Copied.' }),
          () => setResult({ status: 'error', message: 'Copying is blocked in this browser.' }),
        );
      },
      show: body.trim().length > 0,
    },
    { key: 'forward', label: 'Forward', icon: <Forward size={16} />, onSelect: () => (setOpen(false), setDialog('forward')), show: props.canForward },
    {
      key: 'pin',
      label: isPinned ? 'Unpin' : 'Pin',
      icon: isPinned ? <PinOff size={16} /> : <Pin size={16} />,
      onSelect: () => run(() => setMessagePinnedAction(conversationId, messageId, !isPinned)),
      show: canPost,
    },
    {
      key: 'star',
      label: isStarred ? 'Unstar' : 'Star',
      icon: isStarred ? <StarOff size={16} /> : <Star size={16} />,
      onSelect: () => run(() => setMessageStarredAction(conversationId, messageId, !isStarred)),
      show: true,
    },
    { key: 'edit', label: 'Edit', icon: <Pencil size={16} />, onSelect: () => (setOpen(false), setDraft(body), setEditing(true)), show: canEdit },
    { key: 'select', label: 'Select', icon: <CheckSquare size={16} />, onSelect: () => (setOpen(false), selection?.start(messageId)), show: Boolean(selection) },
    { key: 'delete', label: 'Delete', icon: <Trash2 size={16} />, onSelect: () => (setOpen(false), setDialog('delete')), show: true, danger: true },
  ];

  return (
    <div ref={menuRef} className={styles.wrapper} data-mine={isMine}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isPending}
        onClick={() => {
          // The time is read on click, outside of rendering.
          setOpenedAt(Date.now());
          setPoint(null);
          setOpen((value) => !value);
        }}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={styles.menu}
          data-at-pointer={point !== null}
          style={point ? { left: point.x, top: point.y } : undefined}
          role="menu"
          aria-label="Message options"
        >
          {items
            .filter((item) => item.show)
            .map((item) => (
              <button key={item.key} type="button" role="menuitem" className={styles.item} data-danger={item.danger} onClick={item.onSelect}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
        </div>
      )}
      {result.status !== 'idle' && !open && (
        <span className={styles.toast} role="status" data-tone={result.status} onAnimationEnd={() => setResult({ status: 'idle' })}>
          {result.message}
        </span>
      )}

      <ChatDialog title="Message info" open={dialog === 'info'} onClose={() => setDialog(null)}>
        <MessageInfo messageId={messageId} body={body} sentAt={props.sentAt} />
      </ChatDialog>
      <ChatDialog title="Forward message" open={dialog === 'forward'} onClose={() => setDialog(null)}>
        <ForwardForm messageIds={[messageId]} targets={targets} onDone={() => setDialog(null)} />
      </ChatDialog>
      <ChatDialog title="Delete message" open={dialog === 'delete'} onClose={() => setDialog(null)}>
        <DeleteForm
          conversationId={conversationId}
          messageIds={[messageId]}
          canDeleteForEveryone={canDeleteForEveryone}
          onDone={() => setDialog(null)}
        />
      </ChatDialog>
    </div>
  );
}
