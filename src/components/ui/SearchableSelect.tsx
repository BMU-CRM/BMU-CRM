'use client';

import { Check, ChevronDown } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import styles from './SearchableSelect.module.css';

export type SearchableOption = { value: string; label: string };

export type SearchableSelectProps = {
  name: string;
  options: SearchableOption[];
  // Shown as an empty first choice, such as "Any status" or "Choose someone".
  placeholder?: string;
  id?: string;
  value?: string;
  defaultValue?: string | number | readonly string[];
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  form?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

function normalise(text: string) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// A dropdown you can type into to narrow the choices. A hidden native select carries
// the value, so forms submit, validate and reset exactly as with a plain select.
export function SearchableSelect({
  name,
  options,
  placeholder,
  id,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  className,
  form,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SearchableSelectProps) {
  const generatedId = useId();
  const inputId = id ?? `select-${generatedId}`;
  const listId = `${inputId}-list`;

  const choices = useMemo(
    () => (placeholder !== undefined ? [{ value: '', label: placeholder }, ...options] : options),
    [options, placeholder],
  );
  const initial = useMemo(() => {
    const wanted = defaultValue === undefined || defaultValue === null ? undefined : String(defaultValue);
    if (wanted !== undefined && choices.some((choice) => choice.value === wanted)) return wanted;
    return choices[0]?.value ?? '';
    // Like a native select, the starting value is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [ownValue, setOwnValue] = useState(initial);
  // If the choices change and the chosen one is gone, fall back to the first, as a
  // native select does.
  const wanted = value ?? ownValue;
  const current = choices.some((choice) => choice.value === wanted) ? wanted : (choices[0]?.value ?? '');
  const selected = choices.find((choice) => choice.value === current);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const term = normalise(query.trim());
    return term ? choices.filter((choice) => normalise(choice.label).includes(term)) : choices;
  }, [choices, query]);

  // A form reset puts the choice back to where it started, unless the form keeps its
  // values after an error.
  useEffect(() => {
    const owner = selectRef.current?.form;
    if (!owner) return;
    const onReset = (event: Event) => {
      setTimeout(() => {
        if (!event.defaultPrevented) setOwnValue(initial);
      });
    };
    owner.addEventListener('reset', onReset);
    return () => owner.removeEventListener('reset', onReset);
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openList() {
    if (disabled) return;
    const index = choices.findIndex((choice) => choice.value === current);
    setQuery('');
    setActive(Math.max(index, 0));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(choice: SearchableOption) {
    close();
    if (choice.value === current) return;
    if (value === undefined) setOwnValue(choice.value);
    const select = selectRef.current;
    if (select && onChange) {
      select.value = choice.value;
      onChange({ target: select, currentTarget: select } as ChangeEvent<HTMLSelectElement>);
    }
    // Lets filter bars apply the choice straight away (ListInteractions). A custom event,
    // because a real "change" would make React put the old value back first.
    select?.dispatchEvent(new CustomEvent('searchable-change', { bubbles: true }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => Math.min(Math.max(index + step, 0), Math.max(matches.length - 1, 0)));
    } else if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      const choice = matches[active];
      if (choice) pick(choice);
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        close();
      }
    } else if (event.key === 'Tab') {
      close();
    }
  }

  const activeId = open && matches[active] ? `${listId}-${active}` : undefined;
  const showsPlaceholder = !selected || (placeholder !== undefined && current === '');

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      <select
        ref={selectRef}
        name={name}
        id={`${inputId}-value`}
        className={styles.native}
        value={current}
        onChange={() => undefined}
        required={required}
        disabled={disabled}
        form={form}
        tabIndex={-1}
        aria-hidden="true"
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        className={styles.input}
        data-placeholder={showsPlaceholder}
        value={open ? query : (selected?.label ?? '')}
        placeholder={open ? selected?.label || 'Type to search' : (placeholder ?? 'Choose…')}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onChange={(event) => {
          if (!open) openList();
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={styles.list}
          // Keeps focus in the box, so a click lands before the list closes.
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.length === 0 && <li className={styles.empty}>No matches</li>}
          {matches.map((choice, index) => (
            <li
              key={choice.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={choice.value === current}
              data-active={index === active}
              data-empty-choice={choice.value === '' && placeholder !== undefined}
              className={styles.option}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(choice)}
            >
              <span className={styles.optionLabel}>{choice.label}</span>
              {choice.value === current && <Check size={14} aria-hidden="true" className={styles.check} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
