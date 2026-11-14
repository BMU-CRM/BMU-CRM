import { ButtonLink } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { periodKeys, periodLabels, type DateRange, type PeriodKey } from '@/lib/finance/financialPeriods';

const periodOptions = periodKeys.map((key) => ({ value: key, label: periodLabels[key] }));

// The period choice used by dashboards and reports: a named period, or chosen dates.
// It is a plain form, so the choice lives in the address and can be shared.
// `hidden` carries other choices, such as the report tab, through a change of period.
export function PeriodFilter({
  basePath,
  range,
  period,
  hidden = {},
}: {
  basePath: string;
  range: DateRange;
  period?: PeriodKey;
  hidden?: Record<string, string>;
}) {
  const clearHref = Object.keys(hidden).length ? `${basePath}?${new URLSearchParams(hidden)}` : basePath;
  return (
    <form method="get" className={filterStyles.filters}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SelectField label="Period" name="period" options={periodOptions} defaultValue={period ?? ''} placeholder="Chosen dates" />
      <TextField label="From" name="from" type="date" defaultValue={period ? '' : range.from} />
      <TextField label="To" name="to" type="date" defaultValue={period ? '' : range.to} />
      <div className={filterStyles.actions}>
        <ButtonLink href={clearHref} variant="ghost">
          Clear
        </ButtonLink>
      </div>
    </form>
  );
}
