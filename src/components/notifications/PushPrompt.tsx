'use client';

import { BellRing, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { checkPushDevice, refreshPushDevice, turnOnPush, type PushDeviceState } from '@/lib/notifications/pushDevice';
import styles from './PushPrompt.module.css';

const dismissedKey = 'crm.pushPromptDismissedAt';
// After "Not now", ask again a week later.
const askAgainAfterMs = 7 * 24 * 60 * 60 * 1000;

function wasDismissedRecently() {
  try {
    const at = Number(window.localStorage.getItem(dismissedKey));
    return Number.isFinite(at) && Date.now() - at < askAgainAfterMs;
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(dismissedKey, String(Date.now()));
  } catch {
    // Without storage the prompt simply shows again next time.
  }
}

// Shown at the top of every page until desktop notifications are on for this browser,
// so people hear about new tasks, messages and deadlines while the CRM is closed.
export function PushPrompt({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<PushDeviceState>('checking');
  const [hidden, setHidden] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    checkPushDevice().then(
      (current) => {
        setState(current);
        setHidden(wasDismissedRecently());
        // Already on: make sure the server still has this device, for whoever is signed in.
        if (current === 'on') refreshPushDevice(publicKey).catch(() => undefined);
      },
      () => setState('unsupported'),
    );
  }, []);

  if (hidden || (state !== 'off' && state !== 'blocked')) return null;

  async function turnOn() {
    setIsPending(true);
    setProblem(null);
    try {
      const outcome = await turnOnPush(publicKey);
      setState(outcome.state);
      if (outcome.result.status === 'error') setProblem(outcome.result.message ?? 'Notifications could not be turned on.');
    } catch {
      setProblem('Notifications could not be turned on in this browser. Try again from your notification settings.');
    } finally {
      setIsPending(false);
    }
  }

  function dismiss() {
    rememberDismissed();
    setHidden(true);
  }

  return (
    <aside className={styles.prompt} aria-label="Desktop notifications">
      <BellRing size={18} aria-hidden="true" className={styles.icon} />
      <div className={styles.text}>
        {state === 'blocked' ? (
          <>
            <strong>Notifications are blocked in this browser.</strong>
            <span>
              You will miss new tasks and messages while the CRM is closed. Click the lock or settings icon next to the web
              address, allow Notifications, then reload the page.
            </span>
          </>
        ) : (
          <>
            <strong>Get notified even when the CRM is closed.</strong>
            <span>New tasks, messages, deadlines and meetings arrive as desktop notifications.</span>
          </>
        )}
        {problem && <span className={styles.problem}>{problem}</span>}
      </div>
      <div className={styles.actions}>
        {state === 'off' && (
          <Button variant="primary" onClick={turnOn} disabled={isPending}>
            {isPending ? 'Turning on…' : 'Turn on notifications'}
          </Button>
        )}
        <Link href="/profile/notifications" className={styles.settings}>
          Settings
        </Link>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Not now">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
