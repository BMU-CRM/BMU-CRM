'use client';

import { useActionState } from 'react';
import hrStyles from '@/components/hr/HrForms.module.css';
import { TextAreaField, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import {
  reviewWorkloadReportAction,
  saveWorkloadFlagNoteAction,
  saveWorkloadFlagSettingsAction,
} from '@/server/actions/workloadActions';

// "Looked into", with a comment. Emptying the comment opens the flag again.
export function WorkloadFlagNoteForm({ flagKey, note }: { flagKey: string; note: string | null }) {
  return (
    <InlineActionForm action={saveWorkloadFlagNoteAction.bind(null, flagKey)} submitLabel={note ? 'Update' : 'Looked into'}>
      <TextField
        label="What was done"
        name="note"
        defaultValue={note ?? ''}
        maxLength={1000}
        placeholder="For example: spoke to Ravi, new date Friday"
        required={!note}
      />
    </InlineActionForm>
  );
}

type FlagSettings = {
  overdue_days: number;
  rework_times: number;
  review_wait_days: number;
  idle_working_days: number;
  check_attendance: boolean;
};

export function WorkloadFlagSettingsForm({ settings }: { settings: FlagSettings }) {
  const [result, formAction] = useActionState(saveWorkloadFlagSettingsAction, idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <div className={hrStyles.inline}>
        <TextField label="Overdue by more than (days)" name="overdueDays" type="number" min={1} max={60} defaultValue={settings.overdue_days} required error={errors?.overdueDays} />
        <TextField label="Sent back at least (times)" name="reworkTimes" type="number" min={1} max={20} defaultValue={settings.rework_times} required error={errors?.reworkTimes} />
        <TextField label="Waiting for review over (days)" name="reviewWaitDays" type="number" min={1} max={60} defaultValue={settings.review_wait_days} required error={errors?.reviewWaitDays} />
        <TextField label="No activity for (working days)" name="idleWorkingDays" type="number" min={1} max={30} defaultValue={settings.idle_working_days} required error={errors?.idleWorkingDays} />
        <label className={hrStyles.check}>
          <input type="checkbox" name="checkAttendance" defaultChecked={settings.check_attendance} /> Compare attendance with hours on tasks
        </label>
        <SubmitButton label="Save limits" pendingLabel="Saving…" variant="secondary" />
      </div>
    </KeepValuesForm>
  );
}

// Reviewed, with an optional reply to the sender. Can be sent again to change the reply.
export function ReviewWorkloadReportForm({ reportId, reply, reviewed }: { reportId: string; reply: string | null; reviewed: boolean }) {
  return (
    <InlineActionForm action={reviewWorkloadReportAction.bind(null, reportId)} submitLabel={reviewed ? 'Update reply' : 'Mark as reviewed'}>
      <TextAreaField label="Reply (optional)" name="reply" rows={2} maxLength={1000} defaultValue={reply ?? ''} placeholder="Sent to whoever sent the report" />
    </InlineActionForm>
  );
}
