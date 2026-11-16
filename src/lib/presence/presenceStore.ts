'use client';

// Availability in the browser: telling the server this person has the CRM open, and one
// shared copy of colleagues' statuses for every status dot on the page.
//
// Both go in one small request (a "pulse"). Every pulse is a request to the website, so
// they are kept few:
// - while the person is using the app, a check-in every 2 minutes, and the statuses
//   shown are fetched every 2 minutes, both in the same request;
// - while it is open but untouched, or in the background (another tab in front, the
//   window minimised, the phone screen off), a check-in every 5 minutes, so they show
//   as away rather than offline (offline is 6 minutes without a check-in);
// - after 30 minutes untouched or in the background, none at all: they show as offline,
//   which they are. A tab left open overnight costs nothing;
// - coming back, clicking or typing pulses only when something is due: a check-in or
//   statuses older than the rhythm above.
// Tabs of the same browser share their pulses: a check-in or statuses fetched by one tab
// count for all, so three open tabs cost what one does. Open tabs hear of each pulse
// (BroadcastChannel); a tab opened later reads the last one (localStorage).
import { useEffect, useSyncExternalStore } from 'react';
import { presencePulseAction, type PresenceSnapshot } from '@/server/actions/presenceActions';
import type { PresenceStatus } from './presenceStatus';

const activeEveryMs = 2 * 60_000;
const quietEveryMs = 5 * 60_000;
// Without a click, key press or scroll for this long, the person shows as away.
const idleAfterMs = 5 * 60_000;
// Untouched or in the background for this long, pulses stop until they come back.
const stopAfterMs = 30 * 60_000;
// Due a little early rather than a little late.
const slackMs = 5_000;

const watched = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: PresenceSnapshot = {};
// When each colleague's status was last fetched, by this tab or another.
const fetchedAt = new Map<string, number>();
let pulseTimer: ReturnType<typeof setTimeout> | undefined;
let soonTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
// Set while the app shell is open, which is when this person checks in.
let checkingIn = false;
let lastInput = Date.now();
// The last check-in, and the last one as active, by any tab of this browser.
let lastCheckInAt = 0;
let lastActiveCheckInAt = 0;
let hiddenSince = Date.now();

type PulseMessage = {
  checkedInAt: number | null;
  active: boolean | null;
  asked: string[];
  fetched: number;
  snapshot: PresenceSnapshot;
};

const channel: BroadcastChannel | null =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('crm-presence') : null;

function emit() {
  listeners.forEach((listener) => listener());
}

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function noteCheckIn(at: number, active: boolean) {
  lastCheckInAt = Math.max(lastCheckInAt, at);
  if (active) lastActiveCheckInAt = Math.max(lastActiveCheckInAt, at);
}

// `asked` counts as fetched even when the server had no status for someone, so they are
// not asked for again until the next round.
function noteStatuses(asked: string[], latest: PresenceSnapshot, at: number) {
  asked.forEach((id) => fetchedAt.set(id, Math.max(fetchedAt.get(id) ?? 0, at)));
  if (Object.keys(latest).length === 0) return;
  snapshot = { ...snapshot, ...latest };
  emit();
}

// The last pulse, for tabs opened later. Only for the same person: someone else signing
// in on this browser checks in for themselves.
const storageKey = 'crm.presence';
let myEmployeeId: string | null = null;

type StoredPulse = {
  employeeId: string;
  checkIn: number;
  activeCheckIn: number;
  statuses: Record<string, { status: PresenceStatus; chosen: PresenceStatus | null; at: number }>;
};

function saveForNewTabs() {
  if (!myEmployeeId) return;
  const now = Date.now();
  const statuses: StoredPulse['statuses'] = {};
  fetchedAt.forEach((at, id) => {
    const shown = snapshot[id];
    if (shown && now - at < quietEveryMs) statuses[id] = { ...shown, at };
  });
  const stored: StoredPulse = { employeeId: myEmployeeId, checkIn: lastCheckInAt, activeCheckIn: lastActiveCheckInAt, statuses };
  try {
    localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Storage blocked: this tab simply pulses for itself.
  }
}

function loadFromEarlierTabs() {
  let stored: Partial<StoredPulse> | null = null;
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<StoredPulse> | null;
  } catch {
    return;
  }
  if (!stored || stored.employeeId !== myEmployeeId) return;
  const now = Date.now();
  // Never trust a time from the future, such as after the clock was changed.
  const past = (value: unknown) => (typeof value === 'number' && value <= now ? value : 0);
  noteCheckIn(past(stored.checkIn), false);
  noteCheckIn(past(stored.activeCheckIn), true);
  const latest: PresenceSnapshot = {};
  for (const [id, entry] of Object.entries(stored.statuses ?? {})) {
    const at = past(entry?.at);
    if (!at || now - at >= quietEveryMs || fetchedAt.has(id)) continue;
    fetchedAt.set(id, at);
    latest[id] = { status: entry.status, chosen: entry.chosen };
  }
  if (Object.keys(latest).length) {
    snapshot = { ...snapshot, ...latest };
    emit();
  }
}

channel?.addEventListener('message', (event: MessageEvent<PulseMessage>) => {
  const message = event.data;
  if (message.checkedInAt !== null && message.active !== null) noteCheckIn(message.checkedInAt, message.active);
  noteStatuses(message.asked, message.snapshot, message.fetched);
});

function isUsing(now: number) {
  return isVisible() && now - lastInput < idleAfterMs;
}

// What a pulse now would need to do.
function whatIsDue(now: number) {
  const visible = isVisible();
  const using = isUsing(now);
  const every = using ? activeEveryMs : quietEveryMs;
  const checkIn =
    checkingIn && (using ? now - lastActiveCheckInAt : now - lastCheckInAt) >= every - slackMs;
  // In the background nothing shows the dots, so they are not fetched.
  const statuses = visible && [...watched.keys()].some((id) => now - (fetchedAt.get(id) ?? 0) >= every - slackMs);
  return { checkIn, statuses };
}

// When the next pulse is due, or null to stop until the person comes back.
function nextPulseAt() {
  const now = Date.now();
  if (!isVisible()) {
    if (!checkingIn || now - hiddenSince >= stopAfterMs) return null;
    return lastCheckInAt + quietEveryMs;
  }
  const idle = now - lastInput;
  if (idle >= stopAfterMs) return null;
  const using = idle < idleAfterMs;
  const every = using ? activeEveryMs : quietEveryMs;
  const due: number[] = [];
  if (checkingIn) due.push((using ? lastActiveCheckInAt : lastCheckInAt) + every);
  watched.forEach((_, id) => due.push((fetchedAt.get(id) ?? 0) + every));
  return due.length ? Math.min(...due) : null;
}

function scheduleNext() {
  clearTimeout(pulseTimer);
  pulseTimer = undefined;
  if (!checkingIn && watched.size === 0) return;
  const at = nextPulseAt();
  if (at !== null) pulseTimer = setTimeout(pulse, Math.max(1_000, at - Date.now() + slackMs));
}

async function pulse() {
  clearTimeout(pulseTimer);
  pulseTimer = undefined;
  if (inFlight) return;
  const now = Date.now();
  const due = whatIsDue(now);
  if (!due.checkIn && !due.statuses) return scheduleNext();

  // A request going anyway also checks in and fetches every status shown.
  const active = checkingIn ? isUsing(now) : null;
  const ids = isVisible() ? [...watched.keys()] : [];
  inFlight = true;
  try {
    const latest = await presencePulseAction(active, ids);
    const at = Date.now();
    if (active !== null) noteCheckIn(at, active);
    noteStatuses(ids, latest, at);
    saveForNewTabs();
    channel?.postMessage({
      checkedInAt: active !== null ? at : null,
      active,
      asked: ids,
      fetched: at,
      snapshot: latest,
    } satisfies PulseMessage);
  } catch {
    // Keeps the last known statuses. Tries again in a minute, not straight away.
    const retryAt = Date.now() - activeEveryMs + 60_000;
    if (active !== null) lastCheckInAt = Math.max(lastCheckInAt, retryAt);
    if (active) lastActiveCheckInAt = Math.max(lastActiveCheckInAt, retryAt);
    ids.forEach((id) => fetchedAt.set(id, Math.max(fetchedAt.get(id) ?? 0, retryAt)));
  } finally {
    inFlight = false;
    scheduleNext();
  }
}

// New names on the page are fetched together, a moment after they appear.
function pulseSoon() {
  clearTimeout(soonTimer);
  soonTimer = setTimeout(pulse, 60);
}

function onVisibilityChange() {
  if (isVisible()) {
    lastInput = Date.now();
    // Pulses only if a check-in or the statuses shown are due.
    pulseSoon();
  } else {
    hiddenSince = Date.now();
    // The next check-in comes within 5 minutes of the last one, from whichever tab.
    scheduleNext();
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function markActive() {
  const wasIdle = Date.now() - lastInput >= idleAfterMs;
  lastInput = Date.now();
  // Back after a while: check in as active now rather than at the slower rhythm.
  if (wasIdle && !inFlight) pulseSoon();
}

// Called by the app shell: this person checks in while the CRM is open.
export function startCheckingIn(employeeId: string) {
  checkingIn = true;
  lastInput = Date.now();
  myEmployeeId = employeeId;
  loadFromEarlierTabs();
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  events.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
  pulseSoon();
  return () => {
    checkingIn = false;
    events.forEach((name) => window.removeEventListener(name, markActive));
  };
}

function watch(employeeId: string) {
  const count = watched.get(employeeId) ?? 0;
  watched.set(employeeId, count + 1);
  if (count === 0 && !snapshot[employeeId]) pulseSoon();
  // Restarts the rhythm if it had stopped because nothing was being watched.
  else if (!pulseTimer && !inFlight) scheduleNext();
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

// Shows a change straight away, before the next pulse confirms it, in every tab.
export function setPresenceLocally(employeeId: string, status: PresenceStatus, chosen: PresenceStatus | null) {
  snapshot = { ...snapshot, [employeeId]: { status, chosen } };
  emit();
  saveForNewTabs();
  channel?.postMessage({
    checkedInAt: null,
    active: null,
    asked: [employeeId],
    fetched: Date.now(),
    snapshot: { [employeeId]: { status, chosen } },
  } satisfies PulseMessage);
}

export function usePresence(employeeId: string | null | undefined) {
  useEffect(() => (employeeId ? watch(employeeId) : undefined), [employeeId]);
  return useSyncExternalStore(
    subscribe,
    () => (employeeId ? snapshot[employeeId] : undefined),
    () => undefined,
  );
}
