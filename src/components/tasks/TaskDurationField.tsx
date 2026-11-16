'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import formStyles from '@/components/ui/FormFields.module.css';
import { addWorkingDays, isWorkingDate } from '@/lib/tasks/workingDays';

export type WorkCalendar = { today: string; workingDays: number[]; holidays: string[] };

type TaskDurationFieldProps = { calendar: WorkCalendar };

const dayLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayName = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'UTC' });
const label = (date: string) => dayLabel.format(new Date(`${date}T00:00:00Z`));

// "Working days to finish": fills in the due date from the start date (or today),
// skipping week offs and company holidays. The due date can still be changed by hand,
// and a due date on a day off is pointed out.
export function TaskDurationField({ calendar }: TaskDurationFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const holidays = useMemo(() => new Set(calendar.holidays), [calendar.holidays]);

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;

    function describeDueDate() {
      const due = field('dueDate')?.value;
      if (due && !isWorkingDate(due, calendar.workingDays, holidays)) {
        const reason = calendar.holidays.includes(due) ? 'a holiday' : `a week off (${weekdayName.format(new Date(`${due}T00:00:00Z`))})`;
        setNote(`The due date, ${label(due)}, is ${reason}.`);
      } else {
        setNote(null);
      }
    }

    function fillDueDate() {
      const days = Number(input.current?.value);
      if (!Number.isInteger(days) || days < 1) return describeDueDate();
      const start = field('startDate')?.value || calendar.today;
      const { due, skipped } = addWorkingDays(start, days, calendar.workingDays, holidays);
      const dueField = field('dueDate');
      if (dueField) dueField.value = due;
      const skippedText = skipped.length > 0 ? `, skipping ${skipped.map(label).join(', ')}` : '';
      setNote(`Due ${label(due)}: ${days} working ${days === 1 ? 'day' : 'days'} after ${label(start)}${skippedText}.`);
    }

    function changed(event: Event) {
      const name = (event.target as HTMLInputElement).name;
      if (event.target === input.current || name === 'startDate') fillDueDate();
      else if (name === 'dueDate') {
        if (input.current) input.current.value = '';
        describeDueDate();
      }
    }

    describeDueDate();
    form.addEventListener('input', changed);
    return () => form.removeEventListener('input', changed);
  }, [calendar, holidays]);

  return (
    <div className={formStyles.field}>
      <label htmlFor={id} className={formStyles.label}>
        Working days to finish (optional)
      </label>
      <input ref={input} id={id} type="number" min={1} max={120} step={1} inputMode="numeric" className={formStyles.control} aria-describedby={`${id}-note`} />
      <p id={`${id}-note`} className={formStyles.hint} aria-live="polite">
        {note ?? 'Sets the due date. Week offs and holidays are skipped.'}
      </p>
    </div>
  );
}
