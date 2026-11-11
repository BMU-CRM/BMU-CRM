import { Pencil } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { genderLabels } from '@/lib/employees/employeeRecordLabels';
import { formatDate } from '@/lib/formatDate';
import type { PersonalDetails } from '@/server/services/employeeService';

type EmployeePersonalPanelProps = {
  employeeId: string;
  details: PersonalDetails | null;
  canEdit: boolean;
};

const notSet = 'Not set';

export function EmployeePersonalPanel({ employeeId, details, canEdit }: EmployeePersonalPanelProps) {
  const contact = [details?.emergency_contact_name, details?.emergency_contact_relation && `(${details.emergency_contact_relation})`]
    .filter(Boolean)
    .join(' ');

  return (
    <Panel
      title="Personal details"
      description="Seen only by this person, HR and their managers."
      action={
        canEdit && (
          <ButtonLink href={`/people/employees/${employeeId}/personal/edit`} variant="ghost">
            <Pencil size={16} aria-hidden="true" />
            Edit
          </ButtonLink>
        )
      }
    >
      <dl className={layout.facts}>
        <div>
          <dt>Date of birth</dt>
          <dd>{details?.date_of_birth ? formatDate(details.date_of_birth) : notSet}</dd>
        </div>
        <div>
          <dt>Gender</dt>
          <dd>{details?.gender ? genderLabels[details.gender] : notSet}</dd>
        </div>
        <div>
          <dt>Personal email</dt>
          <dd>{details?.personal_email ?? notSet}</dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd className={layout.text}>{details?.address ?? notSet}</dd>
        </div>
        <div>
          <dt>Emergency contact</dt>
          <dd>
            {contact || notSet}
            {details?.emergency_contact_phone && <span className={layout.muted}> · {details.emergency_contact_phone}</span>}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
