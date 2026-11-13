'use client';

import { FileUp } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/Button';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { importContentCalendarAction } from '@/server/actions/meetingActions';
import styles from './CalendarImportForm.module.css';

// Imports a sheet of content work into the calendar. Shown to content planners.
export function CalendarImportForm({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState(importContentCalendarAction, idleResult);

  return (
    <>
      <Button onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="calendar-import">
        <FileUp size={16} aria-hidden="true" />
        Import sheet
      </Button>
      {open && (
        <section id="calendar-import" className={styles.panel} aria-label="Import a sheet">
          <form action={formAction} key={result.status === 'success' ? result.message : 'import'}>
            <FormMessage result={result} />
            <div className={styles.row}>
              <div className={formStyles.field}>
                <label htmlFor="calendar-file" className={formStyles.label}>
                  Spreadsheet (Excel or CSV)
                </label>
                <input
                  id="calendar-file"
                  name="file"
                  type="file"
                  accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className={formStyles.control}
                />
              </div>
              <SubmitButton label="Import" pendingLabel="Importing…" variant="primary" />
            </div>
          </form>
          <p className={styles.help}>
            One row per piece of work, with the headings <strong>Date, Start time, End time, Category, Title, Brief</strong>. Times are
            optional (10:00 to 11:00 if empty). Each row goes to its category&rsquo;s people as a task, as when you add it by hand. Rows
            already in the calendar are skipped, so you can import the same sheet again after adding to it.
          </p>
          {categories.length > 0 && <p className={styles.help}>Categories: {categories.join(', ')}.</p>}
          <a href="/calendar/import-template" className={styles.template} download>
            Download a sheet to fill in
          </a>
        </section>
      )}
    </>
  );
}
