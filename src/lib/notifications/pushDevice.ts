// Browser steps for push notifications on this device, shared by the settings page and
// the prompt shown across the app. Runs in the browser only.
import { savePushSubscriptionAction } from '@/server/actions/notificationActions';
import type { ActionResult } from '@/lib/actionResult';

export type PushDeviceState = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on';

function toKeyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

// A browser step that never answers shows an error instead of spinning forever.
function withTimeout<T>(promise: Promise<T>, milliseconds = 15000) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The browser did not respond.')), milliseconds)),
  ]);
}

// Waits for the worker itself to report that it is active. The browser's own
// "ready" signal sometimes never fired when the worker was still installing.
async function getActiveRegistration() {
  const registration = await navigator.serviceWorker.register('/sw.js');
  const worker = registration.installing ?? registration.waiting ?? registration.active;

  if (worker && worker.state !== 'activated') {
    await new Promise<void>((resolve) => {
      const onStateChange = () => {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', onStateChange);
          resolve();
        }
      };
      worker.addEventListener('statechange', onStateChange);
      onStateChange();
    });
  }
  return registration;
}

// Registered as the page opens, so the worker is active before anyone clicks.
// Installing it during the click proved unreliable.
export async function checkPushDevice(): Promise<PushDeviceState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

function sameKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return true;
  const expected = toKeyBytes(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

// When push is already on in this browser, tells the server again, each time the app
// opens. This keeps the device linked to whoever is signed in, and brings it back if the
// server dropped it (for example after the push service briefly refused it). If the
// app's push key changed, the browser subscribes again with the new one.
export async function refreshPushDevice(publicKey: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
  const registration = await withTimeout(getActiveRegistration());
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  if (!sameKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = await withTimeout(
      registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKeyBytes(publicKey) }),
      60000,
    );
  }
  await savePushSubscriptionAction(subscription.toJSON(), navigator.userAgent);
}

export async function turnOnPush(publicKey: string): Promise<{ state: PushDeviceState; result: ActionResult }> {
  // Only ask when the browser has not already been told yes.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') {
    return { state: permission === 'denied' ? 'blocked' : 'off', result: { status: 'idle' } };
  }

  const registration = await withTimeout(getActiveRegistration());
  // A browser's very first push subscription registers it with its push service,
  // which can take well over 10 seconds, so this step gets a longer limit.
  const subscription = await withTimeout(
    registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKeyBytes(publicKey) }),
    60000,
  );
  const result = await savePushSubscriptionAction(subscription.toJSON(), navigator.userAgent);
  return { state: result.status === 'success' ? 'on' : 'off', result };
}
