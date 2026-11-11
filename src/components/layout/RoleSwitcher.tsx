'use client';

import { Check, Repeat } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { switchMyRoleAction } from '@/server/actions/employeeActions';
import styles from './RoleSwitcher.module.css';

export type RoleChoice = { id: string; name: string; isMain: boolean; isCurrent: boolean };

// For someone who does two jobs, such as HR and Finance: one login, and a switch
// between the roles. The sidebar, dashboard and access change with it.
export function RoleSwitcher({ roles }: { roles: RoleChoice[] }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (roles.length < 2) return null;

  function choose(role: RoleChoice) {
    if (role.isCurrent) return;
    setProblem(null);
    startTransition(async () => {
      const outcome = await switchMyRoleAction(role.id);
      if (outcome.status === 'error') {
        setProblem(outcome.message ?? 'The role could not be switched.');
        return;
      }
      // The current page may not belong to the new role, so start from the overview.
      router.push('/overview');
      router.refresh();
    });
  }

  return (
    <div className={styles.switcher} role="group" aria-label="Switch role">
      <p className={styles.heading}>
        <Repeat size={14} aria-hidden="true" /> Working as
      </p>
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          className={styles.choice}
          aria-pressed={role.isCurrent}
          disabled={isPending}
          onClick={() => choose(role)}
        >
          <span className={styles.name}>{role.name}</span>
          {role.isCurrent && <Check size={14} aria-hidden="true" className={styles.check} />}
        </button>
      ))}
      {problem && <p className={styles.problem}>{problem}</p>}
    </div>
  );
}
