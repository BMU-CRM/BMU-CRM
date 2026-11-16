'use client';

import { Search } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { openDirectChatAction } from '@/server/actions/messageActions';
import type { ConversationSummary } from '@/server/services/messageService';
import styles from '@/app/(crm)/messages/MessagesLayout.module.css';
import listStyles from './ConversationList.module.css';
import { ConversationList } from './ConversationList';

type Person = { id: string; name: string };

function normalise(text: string) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type ConversationSearchProps = {
  conversations: ConversationSummary[];
  activeId?: string;
  people: Person[];
  // The buttons above the search box.
  actions: ReactNode;
};

// Finds people and chats by name as you type. Chats you already have narrow down in
// place; colleagues you have not messaged yet show below, and a tap opens a chat with
// them. Messages are searched inside each chat, from its own search.
export function ConversationSearch({ conversations, activeId, people, actions }: ConversationSearchProps) {
  const [term, setTerm] = useState('');
  const [opening, startOpening] = useTransition();
  const query = normalise(term);

  const chats = query ? conversations.filter((conversation) => normalise(conversation.displayTitle).includes(query)) : conversations;
  const withChat = new Set(conversations.flatMap((conversation) => (conversation.kind === 'direct' && conversation.other_person_id ? [conversation.other_person_id] : [])));
  const newPeople = query ? people.filter((person) => !withChat.has(person.id) && normalise(person.name).includes(query)).slice(0, 20) : [];

  return (
    <>
      <div className={styles.sidebarHeader}>
        {actions}
        <div className={styles.search} role="search">
          <label htmlFor="people-search" className="visually-hidden">
            Search people and chats
          </label>
          <input
            id="people-search"
            type="search"
            placeholder="Search people"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className={styles.searchInput}
            autoComplete="off"
          />
        </div>
      </div>
      <div className={styles.scroll}>
        {query && chats.length === 0 && newPeople.length === 0 ? (
          <p className={listStyles.empty}>No one matches “{term.trim()}”.</p>
        ) : (
          <>
            {(chats.length > 0 || !query) && <ConversationList conversations={chats} activeId={activeId} />}
            {newPeople.length > 0 && (
              <>
                <p className={styles.peopleHeading}>
                  <Search size={13} aria-hidden="true" /> Start a chat
                </p>
                <ul className={listStyles.list}>
                  {newPeople.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        className={`${listStyles.item} ${styles.personButton}`}
                        disabled={opening}
                        onClick={() => startOpening(() => void openDirectChatAction(person.id))}
                      >
                        <span className={listStyles.icon}>
                          <span className={styles.initial} aria-hidden="true">
                            {person.name.slice(0, 1).toUpperCase()}
                          </span>
                          <PresenceDot employeeId={person.id} variant="overlay" />
                        </span>
                        <span className={listStyles.text}>
                          <span className={listStyles.title}>{person.name}</span>
                          <span className={listStyles.preview}>No messages yet</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
