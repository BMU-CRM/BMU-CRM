'use client';

import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import styles from '@/components/ui/DataTable.module.css';
import {
  deleteDepartmentAction,
  deleteDesignationAction,
  deleteRoleAction,
} from '@/server/actions/organisationActions';

const deleteActions = {
  department: deleteDepartmentAction,
  designation: deleteDesignationAction,
  role: deleteRoleAction,
};

type OrganisationRowActionsProps = {
  kind: keyof typeof deleteActions;
  id: string;
  name: string;
  editHref: string;
  canDelete?: boolean;
};

export function OrganisationRowActions({ kind, id, name, editHref, canDelete = true }: OrganisationRowActionsProps) {
  return (
    <div className={styles.rowActions}>
      <ButtonLink href={editHref} variant="ghost">
        Edit
      </ButtonLink>
      {canDelete && (
        <ConfirmActionButton
          label="Remove"
          title={`Remove ${name}?`}
          description={`This ${kind} will be removed. You can only do this if nothing is using it.`}
          confirmLabel="Remove"
          action={() => deleteActions[kind](id)}
        />
      )}
    </div>
  );
}
