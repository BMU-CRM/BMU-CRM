'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { FieldShell, describedBy } from './FormFields';
import fieldStyles from './FormFields.module.css';
import styles from './PasswordField.module.css';

type PasswordFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string;
  hint?: string;
  error?: string;
  name: string;
};

// A password box with an eye button to show or hide what was typed.
export function PasswordField({ label, hint, error, name, id = name, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className={styles.wrapper}>
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          className={`${fieldStyles.control} ${styles.input}`}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, hint, error)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          {...props}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  );
}
