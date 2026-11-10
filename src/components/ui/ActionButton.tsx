'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/actionResult';
import { Button } from './Button';
import { FormMessage } from './FormMessage';

type ActionButtonProps = {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  action: () => Promise<ActionResult>;
};

// For quick actions that are easy to undo, so they need no confirmation.
export function ActionButton({ label, variant = 'ghost', action }: ActionButtonProps) {
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  return (
    <>
      {result.status === 'error' && <FormMessage result={result} />}
      <Button
        variant={variant}
        disabled={isPending}
        onClick={() => startTransition(async () => setResult(await action()))}
      >
        {label}
      </Button>
    </>
  );
}
