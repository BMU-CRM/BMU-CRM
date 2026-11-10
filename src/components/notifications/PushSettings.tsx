'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormActions } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { notificationKindLabels, type NotificationKind } from '@/lib/notifications/notificationKinds';
import {
  removePushSubscriptionAction,
  savePushPreferencesAction,
  savePushSubscriptionAction,
} from '@/server/actions/notificationActions';
import styles from './PushSettings.module.css';

function toKeyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

type DeviceState = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on';

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

// The browser steps run in a plain async handler, not a React transition. Inside a
// transition they stalled behind the settings form's own pending action.
export function PushDeviceToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<DeviceState>('checking');
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
      if (Notification.permission === 'denied') return 'blocked';
      // Registered as the page opens, so the worker is active before anyone clicks.
      // Installing it during the click proved unreliable.
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      return subscription ? 'on' : 'off';
    }
    check().then(setState, () => setState('unsupported'));
  }, []);

  async function turnOn() {
    setIsPending(true);
    try {
      // Only ask when the browser has not already been told yes.
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const registration = await withTimeout(getActiveRegistration());
      // A browser's very first push subscription registers it with its push service,
      // which can take well over 10 seconds, so this step gets a longer limit.
      const subscription = await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKeyBytes(publicKey) }),
        60000,
      );
      const outcome = await savePushSubscriptionAction(subscription.toJSON(), navigator.userAgent);
      setResult(outcome);
      if (outcome.status === 'success') setState('on');
    } catch {
      setResult({ status: 'error', message: 'Push could not be turned on in this browser.' });
    } finally {
      setIsPending(false);
    }
  }

  async function turnOff() {
    setIsPending(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setResult({ status: 'success', message: 'Push notifications are off for this device.' });
      setState('off');
    } finally {
      setIsPending(false);
    }
  }

  const explanations: Record<DeviceState, string> = {
    checking: 'Checking this device…',
    unsupported: 'This browser does not support push notifications. On an iPhone, add this site to your home screen first.',
    blocked: 'Notifications are blocked for this site. Allow them in your browser settings, then reload this page.',
    off: 'Push notifications are off on this device.',
    on: 'Push notifications are on for this device.',
  };

  return (
    <div>
      <FormMessage result={result} />
      <p className={styles.state}>{explanations[state]}</p>
      {state === 'off' && (
        <Button variant="primary" onClick={turnOn} disabled={isPending}>
          {isPending ? 'Turning on…' : 'Turn on for this device'}
        </Button>
      )}
      {state === 'on' && (
        <Button onClick={turnOff} disabled={isPending}>
          Turn off for this device
        </Button>
      )}
    </div>
  );
}

type PreferencesProps = { preferences: { kind: NotificationKind; pushEnabled: boolean }[] };

export function PushPreferencesForm({ preferences }: PreferencesProps) {
  const [result, formAction] = useActionState(savePushPreferencesAction, idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <fieldset className={styles.list}>
        <legend className="visually-hidden">Send a push notification when</legend>
        {preferences.map((preference) => (
          <label key={preference.kind} className={styles.option}>
            <input type="checkbox" name="push" value={preference.kind} defaultChecked={preference.pushEnabled} />
            <span>{notificationKindLabels[preference.kind]}</span>
          </label>
        ))}
      </fieldset>
      <FormActions>
        <SubmitButton label="Save settings" pendingLabel="Saving…" />
      </FormActions>
    </KeepValuesForm>
  );
}
