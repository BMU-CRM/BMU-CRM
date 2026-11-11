import type { ComponentProps, ReactNode } from 'react';
import styles from './FormFields.module.css';
import { SearchableSelect, type SearchableSelectProps } from './SearchableSelect';

type FieldShellProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

type SharedProps = { label: string; hint?: string; error?: string; name: string; id?: string };

export function TextField({ label, hint, error, name, id = name, ...props }: SharedProps & ComponentProps<'input'>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={name}
        className={styles.control}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, hint, error, name, id = name, ...props }: SharedProps & ComponentProps<'textarea'>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        rows={3}
        className={styles.control}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

type SelectFieldProps = SharedProps &
  Omit<SearchableSelectProps, 'name' | 'id' | 'aria-invalid' | 'aria-describedby'> & {
    options: SelectOption[];
  };

// Every dropdown can be typed into to narrow its choices.
export function SelectField({ label, hint, error, name, id = name, ...props }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <SearchableSelect
        id={id}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        {...props}
      />
    </FieldShell>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
