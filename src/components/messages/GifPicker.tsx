'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import type { ActionResult } from '@/lib/actionResult';
import { gifKindLabels, type GifKind } from '@/lib/messages/giphyUrl';
import { searchGifsAction, sendGifMessageAction } from '@/server/actions/messageActions';
import type { GifResult } from '@/server/services/gifService';
import styles from './GifPicker.module.css';

type GifPickerProps = {
  conversationId: string;
  replyToId: string | null;
  onSent: () => void;
};

// Waits for a pause in typing before searching, so each word typed is not a search.
const searchDelayMs = 450;

// GIFs and stickers from GIPHY. Tapping one sends it straight away, as in WhatsApp.
export function GifPicker({ conversationId, replyToId, onSent }: GifPickerProps) {
  const [kind, setKind] = useState<GifKind>('gif');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isSending, startSending] = useTransition();
  const latestRef = useRef(0);
  const searchId = useId();

  useEffect(() => {
    const request = ++latestRef.current;
    const timer = setTimeout(
      async () => {
        setResults(null);
        setLoadError(null);
        const outcome = await searchGifsAction(kind, query.trim());
        // A newer search has started meanwhile; its answer is the one to show.
        if (request !== latestRef.current) return;
        if (outcome.status === 'success') setResults(outcome.results);
        else setLoadError(outcome.message);
      },
      query.trim() ? searchDelayMs : 0,
    );
    return () => clearTimeout(timer);
  }, [kind, query]);

  function send(gif: GifResult) {
    startSending(async () => {
      const outcome = await sendGifMessageAction(conversationId, {
        kind,
        url: gif.url,
        title: gif.title,
        width: gif.width,
        height: gif.height,
        replyToId,
      });
      setResult(outcome.status === 'error' ? outcome : { status: 'idle' });
      if (outcome.status === 'success') onSent();
    });
  }

  return (
    <div className={styles.picker} role="group" aria-label="GIFs and stickers">
      <div className={styles.tabs} role="tablist" aria-label="GIFs or stickers">
        {(['gif', 'sticker'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={kind === item}
            className={styles.tab}
            onClick={() => setKind(item)}
          >
            {item === 'gif' ? 'GIFs' : 'Stickers'}
          </button>
        ))}
      </div>
      <label className={styles.hiddenLabel} htmlFor={searchId}>
        Search {kind === 'gif' ? 'GIFs' : 'stickers'}
      </label>
      <input
        id={searchId}
        type="search"
        className={styles.search}
        placeholder={kind === 'gif' ? 'Search GIFs' : 'Search stickers'}
        value={query}
        maxLength={50}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      {result.status === 'error' && <FormMessage result={result} />}

      <div className={styles.results} aria-busy={results === null && !loadError}>
        {loadError ? (
          <p className={styles.note}>{loadError}</p>
        ) : results === null ? (
          <p className={styles.note}>Loading…</p>
        ) : results.length === 0 ? (
          <p className={styles.note}>Nothing found. Try another word.</p>
        ) : (
          <div className={styles.grid} data-kind={kind}>
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className={styles.item}
                disabled={isSending}
                title={gif.title || gifKindLabels[kind]}
                onClick={() => send(gif)}
              >
                {/* Shown straight from GIPHY; next/image would copy every GIF through our server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.url}
                  alt={gif.title || gifKindLabels[kind]}
                  width={gif.width}
                  height={gif.height}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className={styles.credit}>Powered by GIPHY</p>
    </div>
  );
}
