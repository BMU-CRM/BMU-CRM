import { ChartFrame, seriesColours } from './ChartFrame';
import styles from './StackedBar.module.css';

type Segment = { label: string; value: number };

type StackedBarProps = {
  label: string;
  segments: Segment[];
  formatValue?: (value: number) => string;
  valueHeading?: string;
  // "ordered" uses one blue from light to dark, for steps such as how late money is;
  // "categories" uses the separate series colours.
  colouring?: 'ordered' | 'categories';
};

const defaultFormat = (value: number) => value.toLocaleString('en-IN');
const orderedSteps = ['var(--ramp-250)', 'var(--ramp-350)', 'var(--ramp-450)', 'var(--ramp-550)', 'var(--ramp-650)'];

// One whole split into parts, as a single 28px bar with a 2px gap between parts.
// A part shows its share inside only when the label fits; the legend names every part.
export function StackedBar({ label, segments, formatValue = defaultFormat, valueHeading = 'Value', colouring = 'categories' }: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  const colourOf = (index: number) =>
    (colouring === 'ordered' ? orderedSteps[Math.min(index, orderedSteps.length - 1)] : seriesColours[index]) as string;
  const share = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));
  const table = {
    columns: ['', valueHeading, 'Share'],
    rows: segments.map((segment) => [segment.label, formatValue(segment.value), `${share(segment.value)}%`]),
  };

  return (
    <ChartFrame
      label={label}
      table={table}
      legend={segments.map((segment, index) => ({ label: segment.label, colour: colourOf(index), value: formatValue(segment.value) }))}
    >
      {total === 0 ? (
        <p className={styles.empty}>Nothing to show yet.</p>
      ) : (
        <div className={styles.bar} role="img" aria-label={`${label}: ${segments.map((segment) => `${segment.label} ${formatValue(segment.value)}`).join(', ')}`}>
          {segments.map((segment, index) =>
            segment.value > 0 ? (
              <span
                key={segment.label}
                className={styles.part}
                style={{ flexGrow: segment.value, background: colourOf(index) }}
                title={`${segment.label}: ${formatValue(segment.value)} (${share(segment.value)}%)`}
                data-dark-text={colouring === 'ordered' ? index < 1 : index === 3}
              >
                {share(segment.value) >= 12 && <span className={styles.partLabel}>{share(segment.value)}%</span>}
              </span>
            ) : null,
          )}
        </div>
      )}
    </ChartFrame>
  );
}
