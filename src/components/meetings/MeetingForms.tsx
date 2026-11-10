'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import {
  FormActions,
  FormGrid,
  SelectField,
  TextAreaField,
  TextField,
  type SelectOption,
} from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { meetingKindLabels } from '@/lib/validation/meetingSchema';
import { saveMeetingAction, saveMeetingNotesAction } from '@/server/actions/meetingActions';

const kindOptions = Object.entries(meetingKindLabels).map(([value, label]) => ({ value, label }));

type MeetingFormProps = {
  meeting?: {
    id: string;
    title: string;
    agenda: string | null;
    kind: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string | null;
    meeting_link: string | null;
    client_id: string | null;
    project_id: string | null;
    participantIds: string[];
  };
  defaultDate?: string;
  defaultClientId?: string;
  people: SelectOption[];
  clients: SelectOption[];
  projects: SelectOption[];
};

export function MeetingForm({ meeting, defaultDate, defaultClientId, people, clients, projects }: MeetingFormProps) {
  const [result, formAction] = useActionState(saveMeetingAction.bind(null, meeting?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Title" name="title" defaultValue={meeting?.title} required error={errors?.title} />
        <SelectField label="Type" name="kind" options={kindOptions} defaultValue={meeting?.kind ?? 'internal'} error={errors?.kind} />
        <TextField label="Date" name="date" type="date" defaultValue={meeting?.date ?? defaultDate} required error={errors?.date} />
        <TextField label="Starts" name="startTime" type="time" defaultValue={meeting?.startTime ?? '10:00'} required error={errors?.startTime} />
        <TextField label="Ends" name="endTime" type="time" defaultValue={meeting?.endTime ?? '10:30'} required error={errors?.endTime} />
        <TextField label="Place" name="location" defaultValue={meeting?.location ?? ''} placeholder="Meeting room, office…" error={errors?.location} />
        <TextField label="Meeting link" name="meetingLink" defaultValue={meeting?.meeting_link ?? ''} placeholder="https://meet.google.com/…" error={errors?.meetingLink} />
        <SelectField label="Client" name="clientId" options={clients} placeholder="None" defaultValue={meeting?.client_id ?? defaultClientId ?? ''} error={errors?.clientId} />
        <SelectField label="Project" name="projectId" options={projects} placeholder="None" defaultValue={meeting?.project_id ?? ''} error={errors?.projectId} />
      </FormGrid>
      <div className={`${formStyles.field} ${layout.spaced}`}>
        <label htmlFor="meeting-people" className={formStyles.label}>
          People
        </label>
        <select
          id="meeting-people"
          name="participantIds"
          multiple
          size={8}
          defaultValue={meeting?.participantIds ?? []}
          className={formStyles.control}
        >
          {people.map((person) => (
            <option key={person.value} value={person.value}>
              {person.label}
            </option>
          ))}
        </select>
        <p className={formStyles.hint}>Hold Ctrl, or Cmd on a Mac, to choose several. Everyone invited is notified.</p>
      </div>
      <div className={layout.spaced}>
        <TextAreaField label="Agenda" name="agenda" rows={4} defaultValue={meeting?.agenda ?? ''} error={errors?.agenda} />
      </div>
      <FormActions>
        <SubmitButton label={meeting ? 'Save changes' : 'Schedule meeting'} pendingLabel="Saving…" />
        <ButtonLink href={meeting ? `/meetings/${meeting.id}` : '/calendar'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function MeetingNotesForm({ meetingId, notes, decisions }: { meetingId: string; notes: string | null; decisions: string | null }) {
  const [result, formAction] = useActionState(saveMeetingNotesAction.bind(null, meetingId), idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <TextAreaField label="Notes" name="notes" rows={6} defaultValue={notes ?? ''} error={result.fieldErrors?.notes} />
      <div className={layout.spaced}>
        <TextAreaField label="Decisions" name="decisions" rows={3} defaultValue={decisions ?? ''} error={result.fieldErrors?.decisions} />
      </div>
      <FormActions>
        <SubmitButton label="Save notes" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}
