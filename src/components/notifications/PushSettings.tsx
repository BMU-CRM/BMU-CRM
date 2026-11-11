'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormActions } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { notificationKindLabels, type NotificationKind } from '@/lib/notifications/notificationKinds';
import { checkPushDevice, turnOnPush, type PushDeviceState } from '@/lib/notifications/pushDevice';
import { removePushSubscriptionAction, savePushPreferencesAction } from '@/server/actions/notificationActions';
import styles from './PushSettings.module.css';

// The browser steps run in a plain async handler, not a React transition. Inside a
// transition they stalled behind the settings form's own pending action.
export function PushDeviceToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<PushDeviceState>('checking');
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    checkPushDevice().then(setState, () => setState('unsupported'));
  }, []);

  async function turnOn() {
    setIsPending(true);
    try {
      const outcome = await turnOnPush(publicKey);
      setState(outcome.state);
      setResult(outcome.result);
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

  const explanations: Record<PushDeviceState, string> = {
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
