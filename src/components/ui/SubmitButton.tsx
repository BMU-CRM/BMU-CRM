'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './Button';

type SubmitButtonProps = {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
};

export function SubmitButton({ label, pendingLabel, variant = 'primary', className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
