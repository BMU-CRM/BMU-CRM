'use client';

// One shared copy of colleagues' availability in the browser. Every status dot on the
// page registers the person it shows, and one request every 30 seconds fetches them
// all, so a page full of names costs a single small request.
import { useEffect, useSyncExternalStore } from 'react';
import { getPresenceAction, type PresenceSnapshot } from '@/server/actions/presenceActions';
import type { PresenceStatus } from './presenceStatus';

const refreshEveryMs = 30_000;

const watched = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: PresenceSnapshot = {};
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let soonTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;

function emit() {
  listeners.forEach((listener) => listener());
}

async function refresh() {
  clearTimeout(pollTimer);
  if (watched.size === 0 || inFlight) return;
  inFlight = true;
  try {
    const latest = await getPresenceAction([...watched.keys()]);
    snapshot = { ...snapshot, ...latest };
    emit();
  } catch {
    // Keeps the last known statuses; the next round tries again.
  } finally {
    inFlight = false;
    pollTimer = setTimeout(refresh, refreshEveryMs);
  }
}

// New names on the page are fetched together, a moment after they appear.
function refreshSoon() {
  clearTimeout(soonTimer);
  soonTimer = setTimeout(refresh, 60);
}

function watch(employeeId: string) {
  const count = watched.get(employeeId) ?? 0;
  watched.set(employeeId, count + 1);
  if (count === 0 && !snapshot[employeeId]) refreshSoon();
  return () => {
    const left = (watched.get(employeeId) ?? 1) - 1;
    if (left <= 0) watched.delete(employeeId);
    else watched.set(employeeId, left);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  // Coming back to the tab shows fresh statuses straight away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshSoon();
  });
}

// Shows a change straight away, before the next round confirms it.
export function setPresenceLocally(employeeId: string, status: PresenceStatus, chosen: PresenceStatus | null) {
  snapshot = { ...snapshot, [employeeId]: { status, chosen } };
  emit();
}

export function usePresence(employeeId: string | null | undefined) {
  useEffect(() => (employeeId ? watch(employeeId) : undefined), [employeeId]);
  return useSyncExternalStore(
    subscribe,
    () => (employeeId ? snapshot[employeeId] : undefined),
    () => undefined,
  );
}
