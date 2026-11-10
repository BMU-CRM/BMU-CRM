'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import type { PermissionScope } from '@/lib/access/permissionKeys';
import { saveRoleAction } from '@/server/actions/organisationActions';
import styles from './RoleForm.module.css';

const scopeLabels: Record<PermissionScope, string> = {
  own: 'Own',
  team: 'Team',
  department: 'Department',
  organisation: 'Organisation',
};

type RolePermissionOption = {
  key: string;
  module: string;
  label: string;
  description: string;
  allowed_scopes: PermissionScope[];
};

type RoleFormProps = {
  role?: {
    id: string;
    name: string;
    description: string | null;
    role_permissions: { permission_key: string; scope: PermissionScope }[];
  };
  permissions: RolePermissionOption[];
};

export function RoleForm({ role, permissions }: RoleFormProps) {
  const [result, formAction] = useActionState(saveRoleAction.bind(null, role?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const modules = [...new Set(permissions.map((permission) => permission.module))];
  const granted = new Map(role?.role_permissions.map((row) => [row.permission_key, row.scope]));

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Role name" name="name" defaultValue={role?.name} required error={errors?.name} />
        <TextField label="Description" name="description" defaultValue={role?.description ?? ''} error={errors?.description} />
      </FormGrid>

      {modules.map((module) => (
        <fieldset key={module} className={styles.module}>
          <legend className={styles.moduleTitle}>{module}</legend>
          {permissions
            .filter((permission) => permission.module === module)
            .map((permission) => (
              <div key={permission.key} className={styles.permission}>
                <div className={styles.permissionText}>
                  <label htmlFor={`permission-${permission.key}`} className={styles.permissionLabel}>
                    {permission.label}
                  </label>
                  <p className={styles.permissionDescription}>{permission.description}</p>
                </div>
                <select
                  id={`permission-${permission.key}`}
                  name={`permission:${permission.key}`}
                  defaultValue={granted.get(permission.key) ?? ''}
                  className={styles.scope}
                >
                  <option value="">No access</option>
                  {permission.allowed_scopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scopeLabels[scope]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </fieldset>
      ))}

      <FormActions>
        <SubmitButton label={role ? 'Save role' : 'Create role'} pendingLabel="Saving…" />
        <ButtonLink href="/settings/roles" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
