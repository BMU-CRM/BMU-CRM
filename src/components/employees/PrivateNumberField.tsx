'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { revealPrivateDetailAction } from '@/server/actions/employeeActions';
import styles from './PrivateNumberField.module.css';

type PrivateNumberFieldProps = {
  employeeId: string;
  field: 'aadhaar' | 'account_number' | 'pan';
  masked: string;
  label: string;
};

// How long a shown number stays on screen before it is hidden again.
const shownForMs = 60_000;

// A masked number in a box with an eye, like a password field. Showing it in full asks
// for the viewer's own password first; each reveal is recorded in the audit log, and
// the number hides itself again after a minute.
export function PrivateNumberField({ employeeId, field, masked, label }: PrivateNumberFieldProps) {
  const [value, setValue] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();

  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => setValue(null), shownForMs);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (asking) passwordRef.current?.focus();
  }, [asking]);

  function toggle() {
    setProblem(null);
    if (value) {
      setValue(null);
      return;
    }
    setAsking((open) => !open);
  }

  function cancel() {
    setAsking(false);
    setProblem(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = passwordRef.current?.value ?? '';
    startTransition(async () => {
      const result = await revealPrivateDetailAction(employeeId, field, password);
      if (result.status === 'success') {
        setValue(result.value);
        setAsking(false);
        setProblem(null);
      } else {
        setProblem(result.message);
        if (passwordRef.current) {
          passwordRef.current.value = '';
          passwordRef.current.focus();
        }
      }
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.box} data-shown={value ? 'true' : 'false'}>
        <span className={styles.number} aria-live="polite">
          {value ?? masked}
        </span>
        <button
          type="button"
          className={styles.eye}
          onClick={toggle}
          aria-label={value ? `Hide ${label}` : `Show full ${label}`}
          aria-expanded={value ? undefined : asking}
          title={value ? 'Hide' : 'Show'}
        >
          {value ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>

      {asking && !value && (
        <form className={styles.ask} onSubmit={submit}>
          <label htmlFor={passwordId} className={styles.askLabel}>
            Your password, to show it
          </label>
          <div className={styles.askRow}>
            <input
              ref={passwordRef}
              id={passwordId}
              type="password"
              autoComplete="current-password"
              className={styles.password}
              aria-invalid={problem ? 'true' : undefined}
              required
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Checking…' : 'Show'}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
