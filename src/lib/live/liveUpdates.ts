'use client';

import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { changeMatches, type LiveChangeMessage, type LiveConfig, type LiveTopic } from './liveConfig';

// One live connection per browser tab, shared by every component that wants to know
// when something changes. Components register what they watch.
//
// /api/live/config says how to listen. On this computer it is the app's own stream
// (/api/live), reopened with the combined list whenever that list changes. On
// Supabase it is Supabase Realtime: one channel for row changes, matched here against
// what each component watches, plus one channel per open conversation for typing.

export type { LiveTopic };

type Entry = {
  topics: LiveTopic[];
  typingConversationId?: string;
  onReady?: () => void;
  onChange?: (change: { table: string; event: string }) => void;
  onTyping?: (signal: { conversationId: string; name: string }) => void;
};

const entries = new Set<Entry>();
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

function typingIds() {
  return [...new Set([...entries].flatMap((entry) => (entry.typingConversationId ? [entry.typingConversationId] : [])))].sort();
}

// ---------------------------------------------------------------------------
// How to listen. The answer for the app's own stream never changes, so it is kept.
// ---------------------------------------------------------------------------

let knownToBeStream = false;
let configRequest: { key: string; config: Promise<LiveConfig | null> } | null = null;

function loadConfig(typing: string[]) {
  const key = typing.join(',');
  if (configRequest?.key !== key) {
    const query = key ? `?${new URLSearchParams({ typing: key }).toString()}` : '';
    configRequest = {
      key,
      config: fetch(`/api/live/config${query}`, { cache: 'no-store' })
        .then((response) => (response.ok ? (response.json() as Promise<LiveConfig>) : null))
        .catch(() => null),
    };
  }
  return configRequest.config;
}

// ---------------------------------------------------------------------------
// The app's own stream
// ---------------------------------------------------------------------------

let source: EventSource | null = null;

function closeStream() {
  source?.close();
  source = null;
}

function connectStream() {
  closeStream();
  const topics = [...entries].flatMap((entry) => entry.topics);
  const typing = typingIds();
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

// ---------------------------------------------------------------------------
// Supabase Realtime
// ---------------------------------------------------------------------------

type RealtimeState = {
  client: RealtimeClient;
  userId: string;
  changesTopic: string;
  joined: boolean;
  // Components already told the connection is ready.
  announced: WeakSet<Entry>;
  typing: Map<string, RealtimeChannel>;
};

let realtime: Promise<RealtimeState> | null = null;

const publicChannel = { config: { private: false, broadcast: { self: false } } };

function closeRealtime() {
  const closing = realtime;
  realtime = null;
  void closing?.then((state) => {
    void state.client.removeAllChannels();
    void state.client.disconnect();
  });
}

function announceReady(state: RealtimeState, everyone: boolean) {
  if (!state.joined) return;
  entries.forEach((entry) => {
    if (everyone || !state.announced.has(entry)) {
      state.announced.add(entry);
      entry.onReady?.();
    }
  });
}

async function startRealtime(config: Extract<LiveConfig, { mode: 'realtime' }>): Promise<RealtimeState> {
  const { RealtimeClient } = await import('@supabase/realtime-js');
  const client = new RealtimeClient(`${config.url.replace(/^http/i, 'ws')}/realtime/v1`, {
    params: { apikey: config.key },
  });
  const state: RealtimeState = {
    client,
    userId: config.userId,
    changesTopic: config.changesTopic,
    joined: false,
    announced: new WeakSet(),
    typing: new Map(),
  };

  client
    .channel(config.changesTopic, publicChannel)
    .on('broadcast', { event: 'change' }, ({ payload }) => {
      const change = payload as LiveChangeMessage;
      entries.forEach((entry) => {
        if (changeMatches(entry.topics, change)) entry.onChange?.({ table: change.table, event: change.event });
      });
    })
    // Joining again after a dropped connection counts as ready too, so pages reload
    // anything they missed while it was down.
    .subscribe((status) => {
      state.joined = status === 'SUBSCRIBED';
      announceReady(state, true);
    });

  return state;
}

function syncTypingChannels(state: RealtimeState, topics: Record<string, string>) {
  for (const [id, channel] of state.typing) {
    if (!(id in topics)) {
      void state.client.removeChannel(channel);
      state.typing.delete(id);
    }
  }
  for (const [id, topic] of Object.entries(topics)) {
    if (state.typing.has(id)) continue;
    const channel = state.client
      .channel(topic, publicChannel)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const signal = payload as { conversationId?: string; name?: string; userId?: string };
        if (signal.conversationId !== id || !signal.name || signal.userId === state.userId) return;
        entries.forEach((entry) => {
          if (entry.typingConversationId === id) entry.onTyping?.({ conversationId: id, name: signal.name as string });
        });
      });
    channel.subscribe();
    state.typing.set(id, channel);
  }
}

async function connectRealtime(config: Extract<LiveConfig, { mode: 'realtime' }>) {
  const current = realtime ? await realtime : null;
  // Someone else signed in on this tab, or the channel changed: start again.
  if (current && (current.userId !== config.userId || current.changesTopic !== config.changesTopic)) closeRealtime();

  realtime ??= startRealtime(config);
  const state = await realtime;
  syncTypingChannels(state, config.typingTopics);
  // Components added after the channel joined hear "ready" once, as they would from
  // a newly opened stream.
  announceReady(state, false);
}

// ---------------------------------------------------------------------------

function connect() {
  const run = ++generation;
  if (entries.size === 0) {
    closeStream();
    closeRealtime();
    return;
  }
  if (knownToBeStream) {
    connectStream();
    return;
  }

  void loadConfig(typingIds()).then((config) => {
    if (run !== generation) return;
    if (!config) {
      // Signed out, or the network dropped. Tries again shortly.
      configRequest = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 10_000);
      return;
    }
    if (config.mode === 'stream') {
      knownToBeStream = true;
      connectStream();
      return;
    }
    connectRealtime(config).catch((error: unknown) => console.error('Live updates could not connect', error));
  });
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
