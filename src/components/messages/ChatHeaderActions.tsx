'use client';

import { ChevronDown, ChevronUp, Crown, EllipsisVertical, Info, LogOut, MinusCircle, Pin, PinOff, Search, UserMinus, X, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import type { SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import type { ActionResult } from '@/lib/actionResult';
import {
  addGroupMembersAction,
  clearChatAction,
  leaveGroupAction,
  openDirectChatAction,
  removeGroupMemberAction,
  renameGroupAction,
  setConversationPinnedAction,
} from '@/server/actions/messageActions';
import { ChatDialog } from './ChatDialogs';
import { openChatInfoEvent } from './ChatTitleButton';
import styles from './ChatHeaderActions.module.css';

export type ChatPerson = {
  id: string;
  full_name: string;
  work_email: string;
  phone: string | null;
  designation: { title: string } | null;
  department: { name: string } | null;
  isAdmin: boolean;
};

type ChatHeaderActionsProps = {
  conversationId: string;
  kind: string;
  title: string;
  myEmployeeId: string;
  isAdmin: boolean;
  people: ChatPerson[];
  createdLabel: string | null;
  // Colleagues who could be added to the group.
  addable: SelectOption[];
  // Pinned to the top of this person's conversation list.
  isPinned: boolean;
};

// Finds words in the messages on screen, highlights them and steps through them.
function ChatSearch({ onClose }: { onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<HTMLElement[]>([]);
  const [index, setIndex] = useState(0);

  function clearMarks() {
    document.querySelectorAll<HTMLElement>('[data-search-text]').forEach((element) => {
      element.removeAttribute('data-match');
      element.removeAttribute('data-current');
    });
  }

  // Marks every matching message and jumps to the newest one.
  function search(value: string) {
    setTerm(value);
    clearMarks();
    const needle = value.trim().toLowerCase();
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-search-text]'));
    const found = needle ? all.filter((element) => (element.dataset.searchText ?? '').includes(needle)) : [];
    found.forEach((element) => element.setAttribute('data-match', 'true'));
    found.at(-1)?.setAttribute('data-current', 'true');
    found.at(-1)?.scrollIntoView({ block: 'center' });
    setMatches(found);
    setIndex(found.length - 1);
  }

  useEffect(() => clearMarks, []);

  function go(step: number) {
    if (matches.length === 0) return;
    const next = (index + step + matches.length) % matches.length;
    setIndex(next);
    matches.forEach((element, at) => element.setAttribute('data-current', String(at === next)));
    matches[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  return (
    <div className={styles.search} role="search">
      <Search size={16} aria-hidden="true" className={styles.searchIcon} />
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search this chat"
        value={term}
        autoFocus
        aria-label="Search this chat"
        onChange={(event) => search(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            go(event.shiftKey ? 1 : -1);
          }
          if (event.key === 'Escape') onClose();
        }}
      />
      <span className={styles.searchCount}>{term.trim() ? (matches.length ? `${index + 1} of ${matches.length}` : 'No matches') : ''}</span>
      <button type="button" className={styles.iconButton} onClick={() => go(-1)} aria-label="Earlier match" disabled={!matches.length}>
        <ChevronUp size={16} aria-hidden="true" />
      </button>
      <button type="button" className={styles.iconButton} onClick={() => go(1)} aria-label="Later match" disabled={!matches.length}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close search">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// A member of the chat. With onOpen, tapping them opens your own chat with them.
function PersonRow({ person, children, onOpen, disabled }: { person: ChatPerson; children?: React.ReactNode; onOpen?: () => void; disabled?: boolean }) {
  const details = (
    <>
      <span className={styles.avatar}>
        <PersonAvatar name={person.full_name} size="small" />
        <PresenceDot employeeId={person.id} variant="overlay" />
      </span>
      <span className={styles.personText}>
        <span className={styles.personName}>
          {person.full_name}
          {person.isAdmin && (
            <span className={styles.admin}>
              <Crown size={11} aria-hidden="true" /> Group admin
            </span>
          )}
        </span>
        <span className={styles.muted}>
          {[person.designation?.title, person.department?.name].filter(Boolean).join(' · ') || person.work_email}
        </span>
      </span>
    </>
  );
  return (
    <li className={styles.person}>
      {onOpen ? (
        <button type="button" className={styles.personOpen} onClick={onOpen} disabled={disabled} title={`Message ${person.full_name}`}>
          {details}
        </button>
      ) : (
        details
      )}
      {children}
    </li>
  );
}

export function ChatHeaderActions(props: ChatHeaderActionsProps) {
  const { conversationId, kind, myEmployeeId, isAdmin, people } = props;
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [dialog, setDialog] = useState<'info' | 'clear' | 'leave' | null>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const isGroup = kind === 'group';
  const other = kind === 'direct' ? people.find((person) => person.id !== myEmployeeId) : undefined;
  const hasInfo = isGroup || Boolean(other);

  // Clicking the chat's name in the header opens its info.
  useEffect(() => {
    if (!hasInfo) return;
    const open = () => {
      setMenuOpen(false);
      setResult({ status: 'idle' });
      setDialog('info');
    };
    window.addEventListener(openChatInfoEvent, open);
    return () => window.removeEventListener(openChatInfoEvent, open);
  }, [hasInfo]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === 'success') {
        after?.();
        router.refresh();
      }
    });
  }

  const choose = (next: 'info' | 'clear' | 'leave') => {
    setMenuOpen(false);
    setResult({ status: 'idle' });
    setDialog(next);
  };

  return (
    <>
      <div ref={menuRef} className={styles.actions}>
        <button type="button" className={styles.iconButton} onClick={() => setSearching((value) => !value)} aria-label="Search this chat" title="Search">
          <Search size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Chat menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Menu"
        >
          <EllipsisVertical size={18} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className={styles.menu} role="menu" aria-label="Chat menu">
            {(isGroup || other) && (
              <button type="button" role="menuitem" className={styles.item} onClick={() => choose('info')}>
                <Info size={16} aria-hidden="true" /> {isGroup ? 'Group info' : 'Contact info'}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setMenuOpen(false);
                setSearching(true);
              }}
            >
              <Search size={16} aria-hidden="true" /> Search
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              disabled={isPending}
              onClick={() => {
                setMenuOpen(false);
                run(() => setConversationPinnedAction(conversationId, !props.isPinned));
              }}
            >
              {props.isPinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />} {props.isPinned ? 'Unpin chat' : 'Pin chat'}
            </button>
            <div className={styles.divider} />
            <button type="button" role="menuitem" className={styles.item} onClick={() => router.push('/messages')}>
              <XCircle size={16} aria-hidden="true" /> Close chat
            </button>
            <button type="button" role="menuitem" className={styles.item} onClick={() => choose('clear')}>
              <MinusCircle size={16} aria-hidden="true" /> Clear chat
            </button>
            {isGroup && (
              <button type="button" role="menuitem" className={styles.item} data-danger="true" onClick={() => choose('leave')}>
                <LogOut size={16} aria-hidden="true" /> Exit group
              </button>
            )}
          </div>
        )}
      </div>

      {searching && <ChatSearch onClose={() => setSearching(false)} />}

      <ChatDialog title={isGroup ? 'Group info' : 'Contact info'} open={dialog === 'info'} onClose={() => setDialog(null)}>
        <div className={styles.info}>
          <FormMessage result={result} />
          {isGroup ? (
            <>
              {isAdmin ? (
                <form
                  className={styles.rename}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = String(new FormData(event.currentTarget).get('title') ?? '');
                    run(() => renameGroupAction(conversationId, title));
                  }}
                >
                  <label htmlFor="group-title-edit" className={styles.label}>
                    Group name
                  </label>
                  <div className={styles.renameRow}>
                    <input id="group-title-edit" name="title" defaultValue={props.title} className={styles.input} maxLength={120} required />
                    <Button type="submit" disabled={isPending}>
                      Save
                    </Button>
                  </div>
                </form>
              ) : (
                <p className={styles.groupName}>{props.title}</p>
              )}
              {props.createdLabel && <p className={styles.muted}>{props.createdLabel}</p>}
              <h3 className={styles.heading}>{people.length} members</h3>
              <p className={styles.muted}>Tap someone to message them.</p>
              <ul className={styles.people}>
                {people.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    disabled={isPending}
                    onOpen={
                      person.id === myEmployeeId
                        ? undefined
                        : () => {
                            setDialog(null);
                            run(() => openDirectChatAction(person.id));
                          }
                    }
                  >
                    {isAdmin && person.id !== myEmployeeId && (
                      <button
                        type="button"
                        className={styles.iconButton}
                        disabled={isPending}
                        onClick={() => run(() => removeGroupMemberAction(conversationId, person.id))}
                        aria-label={`Remove ${person.full_name}`}
                        title="Remove from group"
                      >
                        <UserMinus size={16} aria-hidden="true" />
                      </button>
                    )}
                  </PersonRow>
                ))}
              </ul>
              {isAdmin && props.addable.length > 0 && (
                <form
                  className={styles.add}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const chosen = new FormData(form).getAll('newMembers').map(String);
                    run(() => addGroupMembersAction(conversationId, chosen), () => form.reset());
                  }}
                >
                  <SearchableMultiSelect id="group-add" name="newMembers" label="Add people" options={props.addable} />
                  <Button type="submit" variant="primary" disabled={isPending}>
                    Add to group
                  </Button>
                </form>
              )}
              <Button variant="danger" onClick={() => choose('leave')}>
                <LogOut size={16} aria-hidden="true" /> Exit group
              </Button>
            </>
          ) : (
            other && (
              <>
                <ul className={styles.people}>
                  <PersonRow person={{ ...other, isAdmin: false }} />
                </ul>
                <dl className={styles.details}>
                  <div>
                    <dt>Email</dt>
                    <dd>
                      <a href={`mailto:${other.work_email}`}>{other.work_email}</a>
                    </dd>
                  </div>
                  {other.phone && (
                    <div>
                      <dt>Phone</dt>
                      <dd>
                        <a href={`tel:${other.phone}`}>{other.phone}</a>
                      </dd>
                    </div>
                  )}
                </dl>
              </>
            )
          )}
        </div>
      </ChatDialog>

      <ChatDialog title="Clear this chat?" open={dialog === 'clear'} onClose={() => setDialog(null)}>
        <div className={styles.info}>
          <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
          <p className={styles.muted}>Every message so far disappears for you only. Others still see them.</p>
          <div className={dialogStyles.actions}>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={isPending} onClick={() => run(() => clearChatAction(conversationId), () => setDialog(null))}>
              Clear chat
            </Button>
          </div>
        </div>
      </ChatDialog>

      <ChatDialog title="Exit this group?" open={dialog === 'leave'} onClose={() => setDialog(null)}>
        <div className={styles.info}>
          <FormMessage result={result.status === 'error' ? result : { status: 'idle' }} />
          <p className={styles.muted}>You will stop receiving its messages. An admin can add you back.</p>
          <div className={dialogStyles.actions}>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={isPending} onClick={() => run(() => leaveGroupAction(conversationId))}>
              Exit group
            </Button>
          </div>
        </div>
      </ChatDialog>
    </>
  );
}
