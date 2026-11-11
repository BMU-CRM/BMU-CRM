'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SearchableOption } from './SearchableSelect';
import styles from './SearchableMultiSelect.module.css';

type SearchableMultiSelectProps = {
  id: string;
  name: string;
  label: string;
  options: SearchableOption[];
  defaultValue?: string[];
  hint?: string;
  error?: string;
};

function normalise(text: string) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Choose several from a list you can type into. Each choice is a checkbox with the same
// name, so the form receives the same list of values a multiple select would send.
export function SearchableMultiSelect({ id, name, label, options, defaultValue = [], hint, error }: SearchableMultiSelectProps) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(defaultValue));
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const initial = useRef(defaultValue);

  // A form reset clears the choices back to where they started, unless the form keeps
  // its values after an error.
  useEffect(() => {
    const owner = listRef.current?.closest('form');
    if (!owner) return;
    const onReset = (event: Event) => {
      setTimeout(() => {
        if (!event.defaultPrevented) {
          setChosen(new Set(initial.current));
          setQuery('');
        }
      });
    };
    owner.addEventListener('reset', onReset);
    return () => owner.removeEventListener('reset', onReset);
  }, []);

  const term = normalise(query.trim());
  const visible = useMemo(
    () => new Set(options.filter((option) => !term || normalise(option.label).includes(term)).map((option) => option.value)),
    [options, term],
  );
  const chosenOptions = options.filter((option) => chosen.has(option.value));

  function toggle(value: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={styles.searchBox}>
        <Search size={16} aria-hidden="true" className={styles.searchIcon} />
        <input
          id={id}
          type="search"
          className={styles.search}
          placeholder="Type to search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter filters; it should not submit the form.
            if (event.key === 'Enter') event.preventDefault();
          }}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-label={`Search ${label.toLowerCase()}`}
          autoComplete="off"
        />
      </div>
      {chosenOptions.length > 0 && (
        <ul className={styles.chips} aria-label={`Chosen ${label.toLowerCase()}`}>
          {chosenOptions.map((option) => (
            <li key={option.value} className={styles.chip}>
              {option.label}
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => toggle(option.value, false)}
                aria-label={`Remove ${option.label}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={listRef} role="group" aria-labelledby={labelId} className={styles.list} data-invalid={Boolean(error)}>
        {options.map((option) => (
          <label key={option.value} className={styles.option} hidden={!visible.has(option.value)}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              checked={chosen.has(option.value)}
              onChange={(event) => toggle(option.value, event.target.checked)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        {visible.size === 0 && <p className={styles.empty}>No matches</p>}
      </div>
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
