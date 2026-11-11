'use client';

import { useActionState } from 'react';
import { FormActions, FormGrid, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { addDriveLinkAction, shareFileAction, updateFileDetailsAction } from '@/server/actions/fileActions';
import type { FileLinks } from '@/lib/validation/fileSchema';
import styles from './FileForms.module.css';

export function DriveLinkForm({ links = {} }: { links?: FileLinks }) {
  const [result, formAction] = useActionState(addDriveLinkAction.bind(null, links), idleResult);

  return (
    <KeepValuesForm action={formAction} key={result.status === 'success' ? result.message : 'form'}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Name" name="name" id="link-name" required error={result.fieldErrors?.name} />
        <TextField label="Address" name="url" id="link-url" type="url" placeholder="https://drive.google.com/…" required error={result.fieldErrors?.url} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Add link" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}

type ShareFormProps = {
  fileId: string;
  employees: SelectOption[];
  departments: SelectOption[];
};

export function FileShareForm({ fileId, employees, departments }: ShareFormProps) {
  const [result, formAction] = useActionState(shareFileAction.bind(null, fileId), idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <SearchableMultiSelect
          id="share-employees"
          name="employeeIds"
          label="People"
          options={employees}
          hint="Tick everyone to send it to."
          error={result.fieldErrors?.employeeIds}
        />
        <SearchableMultiSelect id="share-departments" name="departmentIds" label="Departments" options={departments} />

      </FormGrid>
      <div className={styles.row}>
        <TextField label="Note" name="note" id="share-note" error={result.fieldErrors?.note} />
        <TextField
          label="Access until"
          name="expiresOn"
          id="share-expires"
          type="date"
          hint="Leave empty for no limit."
          error={result.fieldErrors?.expiresOn}
        />
      </div>
      <FormActions>
        <SubmitButton label="Send" pendingLabel="Sending…" />
      </FormActions>
    </KeepValuesForm>
  );
}

export function FileDetailsForm({ fileId, name, description }: { fileId: string; name: string; description: string | null }) {
  const [result, formAction] = useActionState(updateFileDetailsAction.bind(null, fileId), idleResult);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <TextField label="Name" name="name" id="file-name" defaultValue={name} required error={result.fieldErrors?.name} />
      <div className={styles.spaced}>
        <TextAreaField label="Description" name="description" id="file-description" defaultValue={description ?? ''} error={result.fieldErrors?.description} />
      </div>
      <FormActions>
        <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}
