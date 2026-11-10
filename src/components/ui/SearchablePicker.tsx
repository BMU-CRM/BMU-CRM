'use client';

import { Check, X } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import fieldStyles from './FormFields.module.css';
import styles from './SearchablePicker.module.css';

export type PickerOption = { value: string; label: string; group?: string };

type SearchablePickerProps = {
  id: string;
  name: string;
  label: string;
  // Shown in the order given, so sort them before passing them in.
  options: PickerOption[];
  multiple?: boolean;
  defaultValue?: string | string[];
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  // Shown in the list when there is nothing to choose from at all.
  emptyMessage?: string;
  // When given, the parent holds the chosen values, for example to link two pickers.
  value?: string[];
  onChange?: (values: string[]) => void;
};

// A field you can type into to find an option, for long lists such as services and
// industries. It follows the combobox pattern, so it works with the keyboard (arrows,
// Enter, Escape, Backspace) and with screen readers. Each chosen value is sent with the
// form as a hidden input named `name`.
export function SearchablePicker({
  id,
  name,
  label,
  options,
  multiple = false,
  defaultValue,
  placeholder = 'Type to search',
  hint,
  error,
  required = false,
  emptyMessage = 'Nothing to choose from yet.',
  value,
  onChange,
}: SearchablePickerProps) {
  const initial = Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : [];
  const [ownSelection, setOwnSelection] = useState<string[]>(initial.filter((item) => options.some((option) => option.value === item)));
  const selected = value ?? ownSelection;
  const setSelected = (next: string[]) => (onChange ? onChange(next) : setOwnSelection(next));
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-list`;

  const labelFor = (value: string) => options.find((option) => option.value === value)?.label ?? value;
  const singleLabel = !multiple && selected[0] ? labelFor(selected[0]) : '';

  // Matches the label or the group name, ignoring case.
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLowerCase().includes(term) || option.group?.toLowerCase().includes(term));
  }, [options, query]);

  const safeActive = Math.min(activeIndex, Math.max(matches.length - 1, 0));
  const activeOption = isOpen ? matches[safeActive] : undefined;
  const optionId = (value: string) => `${id}-option-${value}`;

  function open() {
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  // The list closes after each choice, so it never covers the fields below. Typing,
  // the down arrow or a click in the field opens it again.
  function choose(choice: string) {
    if (multiple) {
      setSelected(selected.includes(choice) ? selected.filter((item) => item !== choice) : [...selected, choice]);
      inputRef.current?.focus();
    } else {
      setSelected([choice]);
    }
    close();
  }

  function remove(item: string) {
    setSelected(selected.filter((other) => other !== item));
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) open();
      else setActiveIndex(Math.min(safeActive + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(safeActive - 1, 0));
    } else if (event.key === 'Enter') {
      if (isOpen && activeOption) {
        event.preventDefault();
        choose(activeOption.value);
      }
    } else if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault();
        close();
      }
    } else if (event.key === 'Backspace' && multiple && query === '' && selected.length > 0) {
      setSelected(selected.slice(0, -1));
    }
  }

  // Groups are shown in the order they first appear in the options.
  const groups: { name: string | undefined; items: PickerOption[] }[] = [];
  for (const option of matches) {
    const last = groups.at(-1);
    if (last && last.name === option.group) last.items.push(option);
    else groups.push({ name: option.group, items: [option] });
  }

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
        {required && <span className="visually-hidden"> (required)</span>}
      </label>
      <div
        className={styles.picker}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
        }}
      >
        <div className={styles.box} data-invalid={Boolean(error)} onClick={() => inputRef.current?.focus()}>
          {multiple &&
            selected.map((value) => (
              <span key={value} className={styles.chip}>
                <span className={styles.chipLabel}>{labelFor(value)}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${labelFor(value)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(value);
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
          <input
            ref={inputRef}
            id={id}
            className={styles.input}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? optionId(activeOption.value) : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            autoComplete="off"
            placeholder={multiple && selected.length > 0 ? 'Add another' : singleLabel || placeholder}
            value={isOpen || multiple ? query : singleLabel}
            onFocus={open}
            onClick={open}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              open();
            }}
            onKeyDown={onKeyDown}
          />
          {!multiple && selected[0] && !required && (
            <button
              type="button"
              className={styles.clear}
              aria-label={`Clear ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                setSelected([]);
                inputRef.current?.focus();
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {isOpen && (
          <div id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple} className={styles.list}>
            {matches.length === 0 && (
              <p className={styles.empty}>{options.length === 0 ? emptyMessage : 'No matches. Try fewer letters.'}</p>
            )}
            {groups.map((group, groupIndex) => {
              const headingId = `${id}-group-${groupIndex}`;
              const items = group.items.map((option) => {
                const index = matches.indexOf(option);
                const isSelected = selected.includes(option.value);
                return (
                  <div
                    key={option.value}
                    id={optionId(option.value)}
                    role="option"
                    aria-selected={isSelected}
                    data-active={index === safeActive}
                    className={styles.option}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option.value)}
                  >
                    <span className={styles.check}>{isSelected && <Check size={16} aria-hidden="true" />}</span>
                    {option.label}
                  </div>
                );
              });
              return group.name ? (
                <div key={group.name} role="group" aria-labelledby={headingId}>
                  <p id={headingId} className={styles.groupLabel}>
                    {group.name}
                  </p>
                  {items}
                </div>
              ) : (
                items
              );
            })}
          </div>
        )}
        <p className="visually-hidden" aria-live="polite">
          {isOpen ? `${matches.length} ${matches.length === 1 ? 'option' : 'options'}` : ''}
        </p>
      </div>
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {hint && !error && (
        <p id={`${id}-hint`} className={fieldStyles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={fieldStyles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
