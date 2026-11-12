'use client';

import { useEffect, useState, useTransition } from 'react';
import { FormMessage } from '@/components/ui/FormMessage';
import { Button } from '@/components/ui/Button';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import type { FirebaseConfig } from '@/lib/auth/firebaseConfig';
import { signInWithGoogleAction } from '@/server/actions/authActions';
import styles from './GoogleSignInButton.module.css';

const quietErrors = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

function friendlyError(code: string) {
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google window. Please allow pop-ups for this site and try again.';
  if (code === 'auth/unauthorized-domain') return 'Google sign-in is not allowed on this web address yet. Please tell your administrator.';
  if (code === 'auth/network-request-failed') return 'Could not reach Google. Check your connection and try again.';
  return 'Google sign-in did not complete. Please try again, or use your password.';
}

type GoogleSignIn = {
  // Opens Google. Returns the Google token, or null when the page is leaving for Google.
  start: () => Promise<string | null>;
  // The Google token after coming back from Google in the same window, if there is one.
  returning: () => Promise<string | null>;
};

// Set just before leaving for Google, so only a real return asks Firebase for a result.
const returnMarker = 'crm-google-sign-in';

// In the installed app (Android, or a home-screen icon) a Google window opens as a
// separate tab that cannot hand the result back, so the app goes to Google and comes
// back in the same window instead. A normal browser keeps the Google window.
function runningAsApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    document.referrer.startsWith('android-app://') ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readMarker() {
  try {
    const marked = window.sessionStorage.getItem(returnMarker) === '1';
    window.sessionStorage.removeItem(returnMarker);
    return marked;
  } catch {
    return false;
  }
}

// Firebase is loaded after the page appears, not with it, so the login page stays
// light. It must be ready before the click: browsers block a Google window that does
// not open straight away from the click. Firebase keeps nothing in the browser
// afterwards, because the app's own session takes over.
async function loadGoogleSignIn(config: FirebaseConfig): Promise<GoogleSignIn> {
  const [{ getApps, initializeApp }, auth] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  const existing = getApps().find((app) => app.name === 'crm-sign-in');
  const firebaseAuth = existing
    ? auth.getAuth(existing)
    : auth.initializeAuth(initializeApp(config, 'crm-sign-in'), {
        persistence: auth.inMemoryPersistence,
        popupRedirectResolver: auth.browserPopupRedirectResolver,
      });

  async function tokenFor(user: { getIdToken: () => Promise<string> }) {
    const token = await user.getIdToken();
    await auth.signOut(firebaseAuth);
    return token;
  }

  return {
    async start() {
      const provider = new auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (runningAsApp()) {
        try {
          window.sessionStorage.setItem(returnMarker, '1');
        } catch {
          // Without the marker the return is still read, just on every visit.
        }
        await auth.signInWithRedirect(firebaseAuth, provider);
        return null;
      }
      const { user } = await auth.signInWithPopup(firebaseAuth, provider);
      return tokenFor(user);
    },
    async returning() {
      if (!readMarker()) return null;
      const result = await auth.getRedirectResult(firebaseAuth);
      return result ? tokenFor(result.user) : null;
    },
  };
}

export function GoogleSignInButton({ config, next }: { config: FirebaseConfig; next?: string }) {
  const [result, setResult] = useState<ActionResult>(idleResult);
  const [googleSignIn, setGoogleSignIn] = useState<GoogleSignIn | null>(null);
  const [waitingForGoogle, setWaitingForGoogle] = useState(false);
  const [signingIn, startSignIn] = useTransition();
  const busy = waitingForGoogle || signingIn;

  function finish(token: string) {
    startSignIn(async () => {
      const outcome = await signInWithGoogleAction(token, next ?? null);
      // A successful sign-in moves to the next page, so only a refusal comes back.
      if (outcome) setResult(outcome);
    });
  }

  function showError(error: unknown) {
    const code = (error as { code?: string }).code ?? '';
    if (!quietErrors.has(code)) setResult({ status: 'error', message: friendlyError(code) });
  }

  useEffect(() => {
    let active = true;
    loadGoogleSignIn(config)
      .then(async (ready) => {
        if (!active) return;
        setGoogleSignIn(() => ready);
        // Back from Google in the same window (the installed app): finish signing in.
        setWaitingForGoogle(true);
        try {
          const token = await ready.returning();
          if (active && token) finish(token);
        } catch (error) {
          if (active) showError(error);
        } finally {
          if (active) setWaitingForGoogle(false);
        }
      })
      .catch((error) => {
        console.error('Google sign-in could not load', error);
        if (active) setResult({ status: 'error', message: 'Google sign-in could not load. Please refresh, or use your password.' });
      });
    return () => {
      active = false;
    };
    // finish and showError only use state setters and next, which come with the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  async function signIn() {
    if (!googleSignIn) return;
    setResult(idleResult);
    setWaitingForGoogle(true);
    let token: string | null;
    try {
      token = await googleSignIn.start();
    } catch (error) {
      showError(error);
      setWaitingForGoogle(false);
      return;
    }
    // null: the page is leaving for Google, so the button stays busy until it does.
    if (!token) return;
    setWaitingForGoogle(false);
    finish(token);
  }

  return (
    <div className={styles.wrapper}>
      <FormMessage result={result} />
      <Button className={styles.button} onClick={signIn} disabled={busy || !googleSignIn}>
        <svg className={styles.logo} viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {busy ? 'Signing in…' : 'Continue with Google'}
      </Button>
    </div>
  );
}
