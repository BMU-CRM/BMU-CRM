'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { revealPrivateDetailAction } from '@/server/actions/employeeActions';
import styles from './RevealNumberButton.module.css';

type RevealNumberButtonProps = {
  employeeId: string;
  field: 'aadhaar' | 'account_number';
  masked: string;
  label: string;
};

// Shows a masked number, and the full number on request. Each reveal is recorded in
// the audit log, and the number is hidden again when the page is left.
export function RevealNumberButton({ employeeId, field, masked, label }: RevealNumberButtonProps) {
  const [value, setValue] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (value) {
      setValue(null);
      return;
    }
    startTransition(async () => {
      const result = await revealPrivateDetailAction(employeeId, field);
      if (result.status === 'success') {
        setValue(result.value);
        setProblem(null);
      } else {
        setProblem(result.message);
      }
    });
  }

  return (
    <span className={styles.wrap}>
      <span className={styles.number} aria-live="polite">
        {value ?? masked}
      </span>
      <Button variant="ghost" onClick={toggle} disabled={isPending} aria-label={value ? `Hide ${label}` : `Show full ${label}`}>
        {value ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        {isPending ? 'Checking…' : value ? 'Hide' : 'Show'}
      </Button>
      {problem && <span className={styles.problem}>{problem}</span>}
    </span>
  );
}
