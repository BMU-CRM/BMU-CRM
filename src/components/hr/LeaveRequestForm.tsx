'use client';

import { useActionState, useState } from 'react';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { requestLeaveAction } from '@/server/actions/hrActions';

type LeaveRequestFormProps = {
  leaveTypes: SelectOption[];
  files: SelectOption[];
};

export function LeaveRequestForm({ leaveTypes, files }: LeaveRequestFormProps) {
  const [result, formAction] = useActionState(requestLeaveAction, idleResult);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction} key={result.status === 'success' ? result.message : 'leave-form'}>
      <FormMessage result={result} />
      <FormGrid>
        <SelectField label="Type of leave" name="leaveTypeId" options={leaveTypes} placeholder="Choose a type" required error={errors?.leaveTypeId} />
        <TextField label="First day" name="startDate" type="date" required error={errors?.startDate} />
        {!isHalfDay && <TextField label="Last day" name="endDate" type="date" hint="Leave empty for a single day." error={errors?.endDate} />}
      </FormGrid>
      <label className={`${formStyles.label} ${layout.spaced}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <input type="checkbox" name="isHalfDay" checked={isHalfDay} onChange={(event) => setIsHalfDay(event.target.checked)} />
        Half day
      </label>
      {errors?.isHalfDay && <p className={formStyles.error}>{errors.isHalfDay}</p>}
      <div className={layout.spaced}>
        <TextAreaField label="Reason" name="reason" required error={errors?.reason} />
      </div>
      {files.length > 0 && (
        <div className={layout.spaced}>
          <SelectField
            label="Supporting document"
            name="attachmentFileId"
            options={files}
            placeholder="None"
            hint="Upload it in Files first, then choose it here."
            error={errors?.attachmentFileId}
          />
        </div>
      )}
      <FormActions>
        <SubmitButton label="Send request" pendingLabel="Sending…" />
      </FormActions>
    </KeepValuesForm>
  );
}
