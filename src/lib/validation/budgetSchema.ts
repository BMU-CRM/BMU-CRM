import { z } from 'zod';

export const budgetKinds = ['month', 'year'] as const;
export const budgetKindLabels: Record<(typeof budgetKinds)[number], string> = { month: 'Month', year: 'Financial year' };

// A month is chosen as YYYY-MM; a financial year by the year it starts, such as 2026
// for April 2026 to March 2027.
export const budgetSchema = z
  .object({
    departmentId: z.uuid('Choose a department.'),
    periodKind: z.enum(budgetKinds, { error: 'Choose a month or a financial year.' }),
    month: z.string().trim(),
    yearStart: z.string().trim(),
    amount: z
      .string()
      .trim()
      .transform((value) => Number(value.replaceAll(',', '')))
      .pipe(z.number({ error: 'Enter the budget.' }).gt(0, 'Enter more than zero.').max(99_99_99_999, 'That amount is too large.'))
      .transform((value) => Math.round(value * 100) / 100),
    notes: z
      .string()
      .trim()
      .max(500, 'Use 500 characters or fewer.')
      .transform((value) => (value === '' ? null : value)),
  })
  .superRefine((values, context) => {
    if (values.periodKind === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.month)) {
      context.addIssue({ code: 'custom', path: ['month'], message: 'Choose the month.' });
    }
    if (values.periodKind === 'year' && !/^20\d{2}$/.test(values.yearStart)) {
      context.addIssue({ code: 'custom', path: ['yearStart'], message: 'Choose the financial year.' });
    }
  })
  .transform((values) => ({
    departmentId: values.departmentId,
    periodKind: values.periodKind,
    periodStart: values.periodKind === 'month' ? `${values.month}-01` : `${values.yearStart}-04-01`,
    amount: values.amount,
    notes: values.notes,
  }));
