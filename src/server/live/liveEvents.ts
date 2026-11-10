// Passes database changes and typing signals to the pages that are open right now.
// Kept on globalThis so code reloaded in development shares one set of listeners.

export type LiveChange = {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  row: Record<string, string | null>;
};

export type TypingSignal = { conversationId: string; name: string; userId: string };

type Hub = {
  changeListeners: Set<(change: LiveChange) => void>;
  typingListeners: Set<(signal: TypingSignal) => void>;
};

const hubKey = Symbol.for('crm.liveEvents');

function hub(): Hub {
  const holder = globalThis as typeof globalThis & { [hubKey]?: Hub };
  holder[hubKey] ??= { changeListeners: new Set(), typingListeners: new Set() };
  return holder[hubKey];
}

export function publishChange(change: LiveChange) {
  for (const listener of hub().changeListeners) listener(change);
}

export function onChange(listener: (change: LiveChange) => void) {
  hub().changeListeners.add(listener);
  return () => hub().changeListeners.delete(listener);
}

export function publishTyping(signal: TypingSignal) {
  for (const listener of hub().typingListeners) listener(signal);
}

export function onTyping(listener: (signal: TypingSignal) => void) {
  hub().typingListeners.add(listener);
  return () => hub().typingListeners.delete(listener);
}
