'use client';

import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { setEmployeeAccountActiveAction } from '@/server/actions/employeeActions';
import { SignInLinkButton } from './SignInLinkButton';

type EmployeeAccountActionsProps = {
  employeeId: string;
  employeeName: string;
  isActive: boolean;
  canChangeAccount: boolean;
  // Which sign-in link the viewer may create: an invitation, a password reset, or none.
  signInLinkKind: 'invite' | 'recovery' | null;
};

export function EmployeeAccountActions({
  employeeId,
  employeeName,
  isActive,
  canChangeAccount,
  signInLinkKind,
}: EmployeeAccountActionsProps) {
  return (
    <>
      {signInLinkKind && <SignInLinkButton employeeId={employeeId} employeeName={employeeName} kind={signInLinkKind} />}
      {canChangeAccount &&
        (isActive ? (
          <ConfirmActionButton
            label="Deactivate"
            title={`Deactivate ${employeeName}?`}
            description="They will lose access straight away. Their history stays in place, and you can reactivate them later."
            confirmLabel="Deactivate"
            action={() => setEmployeeAccountActiveAction(employeeId, false)}
          />
        ) : (
          <ConfirmActionButton
            label="Reactivate"
            title={`Reactivate ${employeeName}?`}
            description="They will be able to sign in again with their existing role."
            confirmLabel="Reactivate"
            variant="secondary"
            action={() => setEmployeeAccountActiveAction(employeeId, true)}
          />
        ))}
    </>
  );
}
