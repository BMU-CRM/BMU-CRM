import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ActionResult } from '@/lib/actionResult';
import styles from './FormMessage.module.css';

export function FormMessage({ result }: { result: ActionResult }) {
  if (result.status === 'idle' || !result.message) return null;

  const isError = result.status === 'error';
  const Icon = isError ? CircleAlert : CircleCheck;

  return (
    <p role={isError ? 'alert' : 'status'} className={isError ? styles.error : styles.success}>
      <Icon size={16} aria-hidden="true" />
      <span>{result.message}</span>
    </p>
  );
}
