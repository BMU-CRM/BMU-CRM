import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value === '' ? null : value));

const date = z.iso.date('Enter a valid date.');

const money = (message = 'Enter an amount.') =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? 0 : Number(value.replaceAll(',', ''))))
    .pipe(z.number({ error: message }).min(0, 'Enter zero or more.').max(99_99_99_999, 'That amount is too large.'))
    .transform((value) => Math.round(value * 100) / 100);

const optionalMoney = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value.replaceAll(',', ''))))
  .pipe(z.number({ error: 'Enter an amount.' }).min(0, 'Enter zero or more.').max(99_99_99_999).nullable());

const rate = z
  .string()
  .trim()
  .transform((value) => Number(value))
  .pipe(z.number({ error: 'Enter a percentage.' }).min(0, 'Enter 0 to 100.').max(100, 'Enter 0 to 100.'));

export const payrollRuleKinds = ['pf', 'esi', 'pt', 'tds'] as const;
export type PayrollRuleKind = (typeof payrollRuleKinds)[number];

export const payrollRuleLabels: Record<PayrollRuleKind, string> = {
  pf: 'Provident fund (PF)',
  esi: 'ESI',
  pt: 'Professional tax',
  tds: 'TDS',
};

export const salaryComponentSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name.').max(80, 'Use 80 characters or fewer.'),
    kind: z.enum(['earning', 'deduction'], { error: 'Choose earning or deduction.' }),
    calculation: z.enum(['fixed', 'percentage'], { error: 'Choose how it is worked out.' }),
    amount: optionalMoney,
    percentage: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : Number(value)))
      .pipe(z.number({ error: 'Enter a percentage.' }).gt(0, 'Enter more than 0.').max(100, 'Enter 100 or less.').nullable()),
    percentageOf: z
      .string()
      .transform((value) => (value === '' ? null : value))
      .pipe(z.enum(['basic', 'gross']).nullable()),
    isTaxable: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((values) => values.calculation !== 'fixed' || values.amount !== null, { message: 'Enter the amount.', path: ['amount'] })
  .refine((values) => values.calculation !== 'percentage' || values.percentage !== null, { message: 'Enter the percentage.', path: ['percentage'] })
  .refine((values) => values.calculation !== 'percentage' || values.percentageOf !== null, { message: 'Choose what it is a percentage of.', path: ['percentageOf'] });

export type PtSlab = { from: number; to: number | null; amount: number };

// One slab per line: "0 - 21000 = 0", "21001 - = 208". An empty top has no limit.
export function parsePtSlabs(text: string): { slabs: PtSlab[]; error: string | null } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { slabs: [], error: 'Enter at least one slab.' };

  const slabs: PtSlab[] = [];
  for (const [index, line] of lines.entries()) {
    const match = line.replaceAll(',', '').match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)?\s*=\s*(\d+(?:\.\d+)?)$/);
    if (!match) return { slabs: [], error: `Line ${index + 1}: write it like "0 - 21000 = 0".` };
    const from = Number(match[1]);
    const to = match[2] === undefined ? null : Number(match[2]);
    if (to !== null && to < from) return { slabs: [], error: `Line ${index + 1}: the top must be above the bottom.` };
    slabs.push({ from, to, amount: Number(match[3]) });
  }
  slabs.sort((a, b) => a.from - b.from);
  for (let index = 1; index < slabs.length; index += 1) {
    const previous = slabs[index - 1]!;
    if (previous.to === null || slabs[index]!.from <= previous.to) return { slabs: [], error: 'Slabs must not overlap.' };
  }
  return { slabs, error: null };
}

export function formatPtSlabs(slabs: PtSlab[] | null | undefined) {
  return (slabs ?? []).map((slab) => `${slab.from} - ${slab.to ?? ''} = ${slab.amount}`).join('\n');
}

export const payrollRuleSchema = z
  .object({
    kind: z.enum(payrollRuleKinds),
    effectiveFrom: date,
    state: optionalText(60),
    employeeRate: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .pipe(rate.nullable()),
    employerRate: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : value))
      .pipe(rate.nullable()),
    wageLimit: optionalMoney,
    slabs: z.string(),
    notes: optionalText(500),
  })
  .superRefine((values, context) => {
    if (values.kind === 'pt') {
      if (!values.state) context.addIssue({ code: 'custom', message: 'Enter the state.', path: ['state'] });
      const { error } = parsePtSlabs(values.slabs);
      if (error) context.addIssue({ code: 'custom', message: error, path: ['slabs'] });
      return;
    }
    if (values.employeeRate === null) context.addIssue({ code: 'custom', message: 'Enter the rate.', path: ['employeeRate'] });
    if (values.kind !== 'tds' && values.employerRate === null) {
      context.addIssue({ code: 'custom', message: "Enter the employer's rate.", path: ['employerRate'] });
    }
  });

export const salaryStructureSchema = z.object({
  effectiveFrom: date,
  basic: money('Enter the basic pay.').refine((value) => value > 0, 'Enter the basic pay.'),
  hra: money(),
  otherAllowances: money(),
  specialAllowance: money(),
  incentive: money(),
  bonus: money(),
  pfApplies: z.boolean(),
  esiApplies: z.boolean(),
  ptState: optionalText(60),
  tdsMonthly: optionalMoney,
  revisionReason: optionalText(500),
});

export const payrollLineSchema = z.object({
  incentive: money(),
  bonus: money(),
  overtimeAmount: money(),
  otherEarnings: money(),
  otherDeductions: money(),
  lopAdjustment: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 0 : Number(value)))
    .pipe(z.number({ error: 'Enter days.' }).min(-31, 'Enter -31 to 31.').max(31, 'Enter -31 to 31.').multipleOf(0.5, 'Use whole or half days.')),
  notes: z.string().trim().max(1000, 'Use 1000 characters or fewer.'),
});

export const startPayrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month.'),
});

export const paymentMethods = ['bank_transfer', 'upi', 'cheque', 'cash', 'card', 'other'] as const;
export const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash',
  card: 'Card',
  tds: 'TDS',
  other: 'Other',
};

export const markPayrollPaidSchema = z.object({
  accountId: z.uuid('Choose the account it was paid from.'),
  paidOn: date,
  method: z.enum(paymentMethods, { error: 'Choose how it was paid.' }),
  reference: optionalText(120),
});

export const payrollDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'send_back'], { error: 'Choose approve or send back.' }),
    note: z.string().trim().max(1000, 'Use 1000 characters or fewer.'),
  })
  .refine((values) => values.decision === 'approve' || values.note.length > 0, {
    message: 'Say what needs to change.',
    path: ['note'],
  });

export const appraisalSchema = z
  .object({
    employeeId: z.uuid('Choose an employee.'),
    periodLabel: z.string().trim().min(2, 'Name the period, such as 2026 or H1 2026.').max(60),
    periodStart: date,
    periodEnd: date,
    rating: z
      .string()
      .transform((value) => Number(value))
      .pipe(z.number({ error: 'Choose a rating.' }).min(1, 'Choose 1 to 5.').max(5, 'Choose 1 to 5.').multipleOf(0.5)),
    notes: optionalText(4000),
  })
  .refine((values) => values.periodEnd >= values.periodStart, { message: 'The period must end after it starts.', path: ['periodEnd'] });

export const payrollSettingsSchema = z.object({
  defaultPtState: optionalText(60),
  absenceLop: z.boolean(),
});

export const payrollRunStatusLabels: Record<string, string> = {
  draft: 'Draft',
  in_review: 'Waiting for approval',
  approved: 'Approved',
  paid: 'Paid',
};
