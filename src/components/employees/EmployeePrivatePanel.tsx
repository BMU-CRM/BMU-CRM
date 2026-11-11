import { Pencil } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { maskAadhaar, maskAccount } from '@/lib/employees/employeeRecordLabels';
import type { PrivateDetails } from '@/server/services/employeeService';
import { RevealNumberButton } from './RevealNumberButton';

type EmployeePrivatePanelProps = {
  employeeId: string;
  details: PrivateDetails | null;
  canEdit: boolean;
  encryptionReady: boolean;
};

const notSet = 'Not set';

// Identity and bank details. Aadhaar and account numbers are masked; showing one in
// full is recorded in the audit log.
export function EmployeePrivatePanel({ employeeId, details, canEdit, encryptionReady }: EmployeePrivatePanelProps) {
  const aadhaar = maskAadhaar(details?.aadhaar_last4 ?? null);
  const account = maskAccount(details?.account_last4 ?? null);

  return (
    <Panel
      title="ID and bank details"
      description="Seen only by this person and HR. Showing a full number is recorded."
      action={
        canEdit && (
          <ButtonLink href={`/people/employees/${employeeId}/private/edit`} variant="ghost">
            <Pencil size={16} aria-hidden="true" />
            Edit
          </ButtonLink>
        )
      }
    >
      {!encryptionReady && (
        <p className={layout.muted}>
          Encryption is not set up yet, so Aadhaar and account numbers cannot be saved or shown. The administrator adds
          FIELD_ENCRYPTION_KEY to the server settings.
        </p>
      )}
      <dl className={layout.facts}>
        <div>
          <dt>Aadhaar</dt>
          <dd>{aadhaar ? <RevealNumberButton employeeId={employeeId} field="aadhaar" masked={aadhaar} label="Aadhaar number" /> : notSet}</dd>
        </div>
        <div>
          <dt>PAN</dt>
          <dd>{details?.pan ?? notSet}</dd>
        </div>
        <div>
          <dt>Bank</dt>
          <dd>{details?.bank_name ?? notSet}</dd>
        </div>
        <div>
          <dt>Account number</dt>
          <dd>
            {account ? <RevealNumberButton employeeId={employeeId} field="account_number" masked={account} label="account number" /> : notSet}
          </dd>
        </div>
        <div>
          <dt>IFSC</dt>
          <dd>{details?.ifsc ?? notSet}</dd>
        </div>
        <div>
          <dt>Account holder</dt>
          <dd>{details?.account_holder ?? notSet}</dd>
        </div>
      </dl>
    </Panel>
  );
}
