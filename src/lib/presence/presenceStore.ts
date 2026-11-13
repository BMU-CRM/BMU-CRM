'use client';

// Availability in the browser: telling the server this person has the CRM open, and one
// shared copy of colleagues' statuses for every status dot on the page.
//
// Both go in one small request (a "pulse"), so an open app costs one request a minute:
// - in the foreground, a pulse every minute: it checks in and fetches the statuses shown;
// - in the background (another tab in front, the window minimised, the phone screen
//   off), only a check-in every 4 minutes, so the person still shows as away rather than
//   offline. Nothing on screen needs fresh statuses then;
// - coming back to the app pulses straight away, so statuses are current at once.
import { useEffect, useSyncExternalStore } from 'react';
import { presencePulseAction, type PresenceSnapshot } from '@/server/actions/presenceActions';
import type { PresenceStatus } from './presenceStatus';

const foregroundEveryMs = 60_000;
const backgroundEveryMs = 4 * 60_000;
// Without a click, key press or scroll for this long, the person shows as away.
const idleAfterMs = 5 * 60_000;

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

function emit() {
  listeners.forEach((listener) => listener());
}

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function scheduleNext() {
  clearTimeout(pulseTimer);
  pulseTimer = undefined;
  if (!checkingIn && watched.size === 0) return;
  pulseTimer = setTimeout(pulse, isVisible() ? foregroundEveryMs : backgroundEveryMs);
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
  lastInput = Date.now();
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
