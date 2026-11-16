'use client';

import { Clock } from 'lucide-react';
import { useId, useState } from 'react';
import { emojiCategories, searchEmoji } from '@/lib/messages/emojiList';
import styles from './EmojiPicker.module.css';

const recentKey = 'crm-recent-emoji';
const recentLimit = 24;

// The emoji you used last, kept in this browser only. Storage can be blocked (private
// windows), so every read and write is allowed to fail.
function readRecent(): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(recentKey) ?? '[]');
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string').slice(0, recentLimit) : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((item) => item !== emoji)].slice(0, recentLimit);
    window.localStorage.setItem(recentKey, JSON.stringify(next));
  } catch {
    // Not remembered this time; the picker works the same.
  }
}

type EmojiPickerProps = {
  onPick: (emoji: string) => void;
  // Read out by screen readers, for example "Add an emoji" or "React with".
  label: string;
};

// Emoji in groups, with a search and the ones you used recently, as in WhatsApp.
export function EmojiPicker({ onPick, label }: EmojiPickerProps) {
  const [recent, setRecent] = useState<string[]>(() => (typeof window === 'undefined' ? [] : readRecent()));
  const [category, setCategory] = useState(recent.length > 0 ? 'recent' : emojiCategories[0]!.key);
  const [query, setQuery] = useState('');
  const searchId = useId();

  const searching = query.trim().length > 0;
  const shown = searching
    ? searchEmoji(query)
    : category === 'recent'
      ? recent
      : (emojiCategories.find((item) => item.key === category)?.emoji.map(([emoji]) => emoji) ?? []);
  const heading = searching
    ? 'Search results'
    : category === 'recent'
      ? 'Recently used'
      : (emojiCategories.find((item) => item.key === category)?.label ?? '');

  function pick(emoji: string) {
    saveRecent(emoji);
    setRecent(readRecent());
    onPick(emoji);
  }

  return (
    <div className={styles.picker} role="group" aria-label={label}>
      <label className={styles.hiddenLabel} htmlFor={searchId}>
        Search emoji
      </label>
      <input
        id={searchId}
        type="search"
        className={styles.search}
        placeholder="Search emoji"
        value={query}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      {!searching && (
        <div className={styles.tabs} role="tablist" aria-label="Emoji groups">
          {recent.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={category === 'recent'}
              className={styles.tab}
              title="Recently used"
              onClick={() => setCategory('recent')}
            >
              <Clock size={16} aria-label="Recently used" />
            </button>
          )}
          {emojiCategories.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={category === item.key}
              className={styles.tab}
              title={item.label}
              aria-label={item.label}
              onClick={() => setCategory(item.key)}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
      <p className={styles.heading}>{heading}</p>
      {shown.length === 0 ? (
        <p className={styles.empty}>No emoji found.</p>
      ) : (
        <div className={styles.grid}>
          {shown.map((emoji) => (
            <button key={emoji} type="button" className={styles.emoji} aria-label={emoji} onClick={() => pick(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
