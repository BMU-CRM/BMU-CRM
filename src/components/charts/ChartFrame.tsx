import type { ReactNode } from 'react';
import styles from './ChartFrame.module.css';

export type ChartTable = { columns: string[]; rows: (string | number)[][] };
export type LegendEntry = { label: string; colour: string; value?: string };

// The frame every chart sits in: its palette in light and dark, an optional legend
// (always given for two or more series), and the same figures as a table, so nothing
// is shown by colour alone and screen readers get the numbers.
export function ChartFrame({
  label,
  table,
  legend,
  children,
}: {
  label: string;
  table: ChartTable;
  legend?: LegendEntry[];
  children: ReactNode;
}) {
  return (
    <figure className={styles.frame} aria-label={label}>
      {children}
      {legend && legend.length > 1 && (
        <ul className={styles.legend} aria-label="Key">
          {legend.map((entry) => (
            <li key={entry.label}>
              <span className={styles.swatch} style={{ background: entry.colour }} aria-hidden="true" />
              <span className={styles.legendLabel}>{entry.label}</span>
              {entry.value && <span className={styles.legendValue}>{entry.value}</span>}
            </li>
          ))}
        </ul>
      )}
      <details className={styles.tableToggle}>
        <summary>Show as table</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th key={cellIndex} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// The reference categorical order, validated for colour-blind readers in both themes.
// Colours follow the entity in this fixed order and are never cycled past eight.
export const seriesColours = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
] as const;

// The top of the axis for these values. Counts of people or days stay whole numbers,
// so the halfway line never reads "0.5 people".
export function axisMaximum(values: number[]) {
  const highest = Math.max(0, ...values);
  const nice = niceMaximum(highest);
  return values.every(Number.isInteger) && nice < 2 ? 2 : nice;
}

// Clean, round axis steps: 0 / 5 / 10, 0 / 1,000 / 2,000 and so on.
export function niceMaximum(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((multiple) => multiple * magnitude >= value) ?? 10;
  return step * magnitude;
}
