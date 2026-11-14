'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { FormActions, FormGrid, SelectField, TextField } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { dayStatusLabels, dayStatusOverrides } from '@/lib/attendance/summariseAttendance';
import { workModeLabels } from '@/lib/validation/hrSchema';
import { correctAttendanceForManyAction } from '@/server/actions/hrActions';
import styles from './AttendanceBulkCorrectionForm.module.css';

type Person = { id: string; name: string; department: string | null };

function daysBetween(from: string, to: string) {
  if (!from) return 0;
  const end = to || from;
  const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(span) && span >= 0 ? span + 1 : 0;
}

// Correct attendance for several people and days at once. Tick people (or "Select all"),
// choose the dates, and fill in only what should change; everything left empty stays as
// it is. Days on approved leave, holidays and week offs are skipped by the database.
export function AttendanceBulkCorrectionForm({ people }: { people: Person[] }) {
  const [result, formAction] = useActionState(correctAttendanceForManyAction, idleResult);
  const errors = result.fieldErrors;
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const selectAll = useRef<HTMLInputElement>(null);

  const departments = useMemo(
    () => [...new Set(people.map((person) => person.department).filter((name): name is string => Boolean(name)))].sort(),
    [people],
  );
  const term = search.trim().toLowerCase();
  const shown = people.filter(
    (person) => (!term || person.name.toLowerCase().includes(term)) && (!department || person.department === department),
  );
  const shownChosen = shown.filter((person) => chosen.has(person.id)).length;
  const allShownChosen = shown.length > 0 && shownChosen === shown.length;

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = shownChosen > 0 && !allShownChosen;
  }, [shownChosen, allShownChosen]);

  function toggle(id: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleShown(on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      for (const person of shown) {
        if (on) next.add(person.id);
        else next.delete(person.id);
      }
      return next;
    });
  }

  const dayCount = daysBetween(fromDate, toDate);
  const records = chosen.size * dayCount;

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />

      <fieldset className={styles.people}>
        <legend className={formStyles.label}>People</legend>
        <div className={styles.pickerFilters}>
          <TextField
            label="Find"
            name="peopleSearch"
            id="bulk-search"
            type="search"
            placeholder="Name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <SelectField
            label="Department"
            name="peopleDepartment"
            id="bulk-department"
            options={departments.map((name) => ({ value: name, label: name }))}
            placeholder="All departments"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          />
        </div>

        <div className={styles.pickerBar}>
          <label className={styles.selectAll}>
            <input
              ref={selectAll}
              type="checkbox"
              checked={allShownChosen}
              disabled={shown.length === 0}
              onChange={(event) => toggleShown(event.target.checked)}
            />
            Select all{term || department ? ' shown' : ''} ({shown.length})
          </label>
          <span className={styles.count} aria-live="polite">
            {chosen.size} chosen
          </span>
          {chosen.size > 0 && (
            <button type="button" className={styles.clear} onClick={() => setChosen(new Set())}>
              Clear choice
            </button>
          )}
        </div>

        <ul className={styles.list}>
          {people.map((person) => (
            // People filtered out stay in the form, hidden, so a ticked person is still sent.
            <li key={person.id} hidden={!shown.includes(person)}>
              <label className={styles.person}>
                <input
                  type="checkbox"
                  name="employeeIds"
                  value={person.id}
                  checked={chosen.has(person.id)}
                  onChange={(event) => toggle(person.id, event.target.checked)}
                />
                <span className={styles.name}>{person.name}</span>
                {person.department && <span className={styles.department}>{person.department}</span>}
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className={styles.none}>No one matches.</li>}
        </ul>
        {errors?.employeeIds && <p className={formStyles.error}>{errors.employeeIds}</p>}
      </fieldset>

      <FormGrid>
        <TextField
          label="From"
          name="fromDate"
          id="bulk-from"
          type="date"
          required
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          error={errors?.fromDate}
        />
        <TextField
          label="To"
          name="toDate"
          id="bulk-to"
          type="date"
          min={fromDate || undefined}
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          hint="Leave empty for one day. Up to 31 days."
          error={errors?.toDate}
        />
        <TextField label="Checked in" name="checkIn" id="bulk-in" type="time" hint="Empty keeps each day's time." error={errors?.checkIn} />
        <TextField label="Checked out" name="checkOut" id="bulk-out" type="time" hint="Empty keeps each day's time." error={errors?.checkOut} />
        <SelectField
          label="Worked from"
          name="workMode"
          id="bulk-mode"
          options={Object.entries(workModeLabels).map(([value, label]) => ({ value, label }))}
          placeholder="Leave as it is"
          error={errors?.workMode}
        />
        <SelectField
          label="Day status"
          name="statusOverride"
          id="bulk-status"
          options={[
            { value: 'auto', label: 'Work it out from the times' },
            ...dayStatusOverrides.map((status) => ({ value: status, label: dayStatusLabels[status] })),
          ]}
          placeholder="Leave as it is"
          error={errors?.statusOverride}
        />
        <TextField label="Reason for the correction" name="note" id="bulk-note" required maxLength={500} error={errors?.note} />
      </FormGrid>

      <p className={styles.summary}>
        {records > 0
          ? `This changes up to ${chosen.size} ${chosen.size === 1 ? 'person' : 'people'} × ${dayCount} ${dayCount === 1 ? 'day' : 'days'} = ${records} ${records === 1 ? 'record' : 'records'}.`
          : 'Choose people and dates to see how many records change.'}{' '}
        Days on approved leave, holidays and week offs are skipped.
      </p>

      <FormActions>
        <SubmitButton label="Save for everyone chosen" pendingLabel="Saving…" variant="secondary" />
      </FormActions>
    </KeepValuesForm>
  );
}
