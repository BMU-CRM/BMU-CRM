import { ChartFrame, seriesColours } from './ChartFrame';
import styles from './DonutChart.module.css';

type Slice = { label: string; value: number };

type DonutChartProps = {
  label: string;
  slices: Slice[];
  formatValue?: (value: number) => string;
  valueHeading?: string;
  // The total in the middle, such as "38 days".
  centreLabel?: string;
};

const defaultFormat = (value: number) => value.toLocaleString('en-IN');

// Parts of one whole. Past seven parts the rest fold into "Other", so colours are
// never reused. A 2px gap separates the parts; the legend names each with its share.
export function DonutChart({ label, slices, formatValue = defaultFormat, valueHeading = 'Value', centreLabel }: DonutChartProps) {
  const positive = slices.filter((slice) => slice.value > 0);
  const folded =
    positive.length > 8
      ? [...positive.slice(0, 7), { label: 'Other', value: positive.slice(7).reduce((sum, slice) => sum + slice.value, 0) }]
      : positive;
  const total = folded.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));
  const table = {
    columns: ['', valueHeading, 'Share'],
    rows: folded.map((slice) => [slice.label, formatValue(slice.value), `${share(slice.value)}%`]),
  };

  if (total === 0) {
    return <p className={styles.empty}>Nothing to show yet.</p>;
  }

  const size = 200;
  const radius = 80;
  const thickness = 26;
  const circumference = 2 * Math.PI * radius;
  // The surface gap between parts, as length along the ring.
  const gap = folded.length > 1 ? 2 : 0;
  // Where each part starts along the ring: the lengths of all the parts before it.
  const lengths = folded.map((slice) => (slice.value / total) * circumference);
  const starts = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, length) => sum + length, 0));

  return (
    <ChartFrame
      label={label}
      table={table}
      legend={folded.map((slice, index) => ({
        label: slice.label,
        colour: seriesColours[index] as string,
        value: `${formatValue(slice.value)} · ${share(slice.value)}%`,
      }))}
    >
      <svg className={styles.chart} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {folded.map((slice, index) => {
            const dash = Math.max((lengths[index] ?? 0) - gap, 0.5);
            return (
              <circle
                key={slice.label}
                className={styles.slice}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seriesColours[index]}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-(starts[index] ?? 0)}
              >
                <title>{`${slice.label}: ${formatValue(slice.value)} (${share(slice.value)}%)`}</title>
              </circle>
            );
          })}
        </g>
        <text x={size / 2} y={size / 2} className={styles.total} textAnchor="middle" dominantBaseline="middle">
          {centreLabel ?? formatValue(total)}
        </text>
      </svg>
    </ChartFrame>
  );
}
