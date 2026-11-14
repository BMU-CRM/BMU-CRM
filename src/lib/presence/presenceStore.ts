'use client';

// Availability in the browser: telling the server this person has the CRM open, and one
// shared copy of colleagues' statuses for every status dot on the page.
//
// Both go in one small request (a "pulse"). Every pulse is a request to the website, so
// they are kept few:
// - while the person is using the app, a pulse every 2 minutes: it checks in and
//   fetches the statuses shown;
// - while it is open but untouched, or in the background (another tab in front, the
//   window minimised, the phone screen off), every 5 minutes, so they show as away
//   rather than offline (offline is 6 minutes without a check-in);
// - after 30 minutes untouched or in the background, none at all: they show as offline,
//   which they are. A tab left open overnight costs nothing;
// - coming back, clicking or typing pulses straight away, so statuses are current.
import { useEffect, useSyncExternalStore } from 'react';
import { presencePulseAction, type PresenceSnapshot } from '@/server/actions/presenceActions';
import type { PresenceStatus } from './presenceStatus';

const activeEveryMs = 2 * 60_000;
const quietEveryMs = 5 * 60_000;
// Without a click, key press or scroll for this long, the person shows as away.
const idleAfterMs = 5 * 60_000;
// Untouched or in the background for this long, pulses stop until they come back.
const stopAfterMs = 30 * 60_000;

const watched = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: PresenceSnapshot = {};
let pulseTimer: ReturnType<typeof setTimeout> | undefined;
let soonTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
// Set while the app shell is open, which is when this person checks in.
let checkingIn = false;
let lastInput = Date.now();
let lastCheckIn = 0;
let hiddenSince = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

// How long until the next pulse, or null to stop until the person comes back.
function nextDelay() {
  const now = Date.now();
  if (!isVisible()) return now - hiddenSince < stopAfterMs ? quietEveryMs : null;
  const idle = now - lastInput;
  if (idle < idleAfterMs) return activeEveryMs;
  return idle < stopAfterMs ? quietEveryMs : null;
}

function scheduleNext() {
  clearTimeout(pulseTimer);
  pulseTimer = undefined;
  if (!checkingIn && watched.size === 0) return;
  const delay = nextDelay();
  if (delay !== null) pulseTimer = setTimeout(pulse, delay);
}

async function pulse() {
  clearTimeout(pulseTimer);
  if (inFlight) return;
  const visible = isVisible();
  // In the background nothing shows the dots, so only check in.
  const ids = visible ? [...watched.keys()] : [];
  const active = checkingIn ? visible && Date.now() - lastInput < idleAfterMs : null;
  if (active === null && ids.length === 0) return scheduleNext();

  inFlight = true;
  try {
    const latest = await presencePulseAction(active, ids);
    if (active !== null) lastCheckIn = Date.now();
    if (ids.length) {
      snapshot = { ...snapshot, ...latest };
      emit();
    }
  } catch {
    // Keeps the last known statuses; the next pulse tries again.
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
  if (!isVisible()) hiddenSince = Date.now();
  if (isVisible()) {
    lastInput = Date.now();
    pulseSoon();
  } else if (checkingIn && Date.now() - lastCheckIn > 30_000) {
    // Leaving: one check-in as away, then the slower background rhythm.
    void pulse();
  } else {
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
export function startCheckingIn() {
  checkingIn = true;
  lastInput = Date.now();
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

// Shows a change straight away, before the next pulse confirms it.
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
