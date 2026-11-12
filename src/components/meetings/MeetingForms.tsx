'use client';

import { useActionState, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import {
  FormActions,
  FormGrid,
  SelectField,
  TextAreaField,
  TextField,
  type SelectOption,
} from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
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
    category_id: string | null;
    participantIds: string[];
  };
  defaultDate?: string;
  defaultClientId?: string;
  people: SelectOption[];
  clients: SelectOption[];
  projects: SelectOption[];
  // Content calendar categories, for people who plan content. Each lists who it goes to.
  categories?: (SelectOption & { people: string[] })[];
};

export function MeetingForm({ meeting, defaultDate, defaultClientId, people, clients, projects, categories }: MeetingFormProps) {
  const [result, formAction] = useActionState(saveMeetingAction.bind(null, meeting?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const [kind, setKind] = useState(meeting?.kind ?? 'internal');
  const [categoryId, setCategoryId] = useState(meeting?.category_id ?? '');
  const category = categories?.find((option) => option.value === categoryId);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Title" name="title" defaultValue={meeting?.title} required error={errors?.title} />
        {categories && (
          <SelectField
            label="Content category"
            name="categoryId"
            options={categories}
            placeholder="Not content work"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              if (event.target.value && kind === 'internal') setKind('content');
            }}
            hint={
              category
                ? category.people.length > 0
                  ? `Added and notified automatically: ${category.people.join(', ')}.`
                  : 'Nobody is set up for this category yet. Add people in Settings, Content calendar.'
                : 'Posters, shoots, reels: the category’s people are added and notified.'
            }
            error={errors?.categoryId}
          />
        )}
        <SelectField label="Type" name="kind" options={kindOptions} value={kind} onChange={(event) => setKind(event.target.value)} error={errors?.kind} />
        <TextField label="Date" name="date" type="date" defaultValue={meeting?.date ?? defaultDate} required error={errors?.date} />
        <TextField label="Starts" name="startTime" type="time" defaultValue={meeting?.startTime ?? '10:00'} required error={errors?.startTime} />
        <TextField label="Ends" name="endTime" type="time" defaultValue={meeting?.endTime ?? '10:30'} required error={errors?.endTime} />
        <TextField label="Place" name="location" defaultValue={meeting?.location ?? ''} placeholder="Meeting room, office…" error={errors?.location} />
        <TextField label="Meeting link" name="meetingLink" defaultValue={meeting?.meeting_link ?? ''} placeholder="https://meet.google.com/…" error={errors?.meetingLink} />
        <SelectField label="Client" name="clientId" options={clients} placeholder="None" defaultValue={meeting?.client_id ?? defaultClientId ?? ''} error={errors?.clientId} />
        <SelectField label="Project" name="projectId" options={projects} placeholder="None" defaultValue={meeting?.project_id ?? ''} error={errors?.projectId} />
      </FormGrid>
      <div className={layout.spaced}>
        <SearchableMultiSelect
          id="meeting-people"
          name="participantIds"
          label="People"
          options={people}
          defaultValue={meeting?.participantIds ?? []}
          hint="Tick everyone to invite. Everyone invited is notified."
          error={errors?.participantIds}
        />
      </div>
      <div className={layout.spaced}>
        <TextAreaField label="Agenda" name="agenda" rows={4} defaultValue={meeting?.agenda ?? ''} error={errors?.agenda} />
      </div>
      <FormActions>
        <SubmitButton label={meeting ? 'Save changes' : categoryId ? 'Add to calendar' : 'Schedule meeting'} pendingLabel="Saving…" />
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
