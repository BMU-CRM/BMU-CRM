// Fills a letter template's {{placeholders}}. Anything unknown, or known but missing,
// is left as a visible blank line so it can be written in by hand.
export type LetterValues = Partial<
  Record<
    | 'name'
    | 'designation'
    | 'department'
    | 'company'
    | 'salary'
    | 'joining_date'
    | 'employee_code'
    | 'start_date'
    | 'end_date'
    | 'last_working_day'
    | 'today',
    string | null
  >
>;

export function renderLetter(text: string, values: LetterValues) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key as keyof LetterValues];
    return value && value.trim() ? value : '__________';
  });
}
