'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

// One live connection per browser tab, shared by every component that wants to know
// when something changes. Components register what they watch; the connection is
// reopened with the combined list whenever that list changes.

export type LiveTopic = { table: string; column?: string; value?: string };

type Entry = {
  topics: LiveTopic[];
  typingConversationId?: string;
  onReady?: () => void;
  onChange?: (change: { table: string; event: string }) => void;
  onTyping?: (signal: { conversationId: string; name: string }) => void;
};

const entries = new Set<Entry>();
let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function connect() {
  source?.close();
  source = null;
  if (entries.size === 0) return;

  const topics = [...entries].flatMap((entry) => entry.topics);
  const typing = [...new Set([...entries].flatMap((entry) => (entry.typingConversationId ? [entry.typingConversationId] : [])))];
  const query = new URLSearchParams({ topics: JSON.stringify(topics) });
  if (typing.length) query.set('typing', typing.join(','));

  const next = new EventSource(`/api/live?${query.toString()}`);
  next.addEventListener('ready', () => entries.forEach((entry) => entry.onReady?.()));
  next.addEventListener('change', (event) => {
    const change = JSON.parse((event as MessageEvent<string>).data) as { table: string; event: string };
    entries.forEach((entry) => {
      if (entry.topics.some((topic) => topic.table === change.table)) entry.onChange?.(change);
    });
  });
  next.addEventListener('typing', (event) => {
    const signal = JSON.parse((event as MessageEvent<string>).data) as { conversationId: string; name: string };
    entries.forEach((entry) => {
      if (entry.typingConversationId === signal.conversationId) entry.onTyping?.(signal);
    });
  });
  source = next;
}

function scheduleConnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 50);
}

export function subscribeLive(entry: Entry) {
  entries.add(entry);
  scheduleConnect();
  return () => {
    entries.delete(entry);
    scheduleConnect();
  };
}

export function sendTyping(conversationId: string) {
  void fetch('/api/live/typing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  }).catch(() => {});
}

// Reloads the page's server data shortly after a watched change, and once when the
// connection opens, to catch anything that changed while it was not connected.
export function useLiveRefresh(topics: LiveTopic[], options: { delayMs?: number; refreshOnConnect?: boolean } = {}) {
  const router = useRouter();
  const key = JSON.stringify(topics);
  const { delayMs = 250, refreshOnConnect = true } = options;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const scheduleRefresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), delayMs);
    };
    const unsubscribe = subscribeLive({
      topics: JSON.parse(key) as LiveTopic[],
      onReady: refreshOnConnect ? scheduleRefresh : undefined,
      onChange: scheduleRefresh,
    });
    return () => {
      clearTimeout(timer.current);
      unsubscribe();
    };
  }, [key, delayMs, refreshOnConnect, router]);
}
