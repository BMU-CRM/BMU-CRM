'use client';

import { useActionState, useState } from 'react';
import { FormActions, FormGrid, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SearchableMultiSelect } from '@/components/ui/SearchableMultiSelect';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { saveCalendarCategoryAction } from '@/server/actions/meetingActions';
import styles from './CalendarCategoryForm.module.css';

type CategoryValues = { id: string; name: string; description: string | null; is_active: boolean; memberIds: string[] };

// A content category and the people its calendar entries go to.
export function CalendarCategoryForm({ category, people }: { category?: CategoryValues; people: SelectOption[] }) {
  // A new category's form starts empty again after each one is added.
  const [added, setAdded] = useState(0);
  const [result, formAction] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const outcome = await saveCalendarCategoryAction(category?.id ?? null, previous, formData);
    if (outcome.status === 'success' && !category) setAdded((count) => count + 1);
    return outcome;
  }, idleResult);
  const prefix = category?.id ?? `new-${added}`;
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction} key={prefix}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Name" name="name" id={`${prefix}-name`} defaultValue={category?.name} required error={errors?.name} />
        <TextField label="Description" name="description" id={`${prefix}-description`} defaultValue={category?.description ?? ''} error={errors?.description} />
      </FormGrid>
      <div className={layout.spaced}>
        <SearchableMultiSelect
          id={`${prefix}-members`}
          name="memberIds"
          label="Goes to"
          options={people}
          defaultValue={category?.memberIds ?? []}
          hint="These people are added to every entry in this category, notified, and see it in their calendar."
          error={errors?.memberIds}
        />
      </div>
      <FormActions>
        {category && (
          <label className={styles.choice}>
            <input type="checkbox" name="isActive" defaultChecked={category.is_active} /> In use
          </label>
        )}
        <SubmitButton label={category ? 'Save' : 'Add category'} pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}
