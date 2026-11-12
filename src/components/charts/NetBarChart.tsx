import { ChartFrame, niceMaximum, seriesColours } from './ChartFrame';
import styles from './BarChart.module.css';

type Bar = { label: string; value: number };

type NetBarChartProps = {
  label: string;
  data: Bar[];
  // What a value above and below zero means, such as "Profit" and "Loss".
  positiveLabel: string;
  negativeLabel: string;
  formatValue?: (value: number) => string;
};

const defaultFormat = (value: number) => value.toLocaleString('en-IN');

// Values that can fall below zero, such as profit or loss each month: bars grow up or
// down from a zero line, in two colours that stay apart for colour-blind readers, and
// the table says which side each one is on.
export function NetBarChart({ label, data, positiveLabel, negativeLabel, formatValue = defaultFormat }: NetBarChartProps) {
  const positive = seriesColours[0];
  const negative = seriesColours[1];
  const table = {
    columns: ['', 'Amount', ''],
    rows: data.map((bar) => [bar.label, formatValue(Math.abs(bar.value)), bar.value < 0 ? negativeLabel : bar.value > 0 ? positiveLabel : '—']),
  };
  const legend = [
    { label: positiveLabel, colour: positive },
    { label: negativeLabel, colour: negative },
  ];
  if (data.length === 0) {
    return <p className={styles.empty}>Nothing to show yet.</p>;
  }

  const width = 600;
  const height = 240;
  const top = 16;
  const bottom = 28;
  const left = 8;
  const plotHeight = height - top - bottom;
  const highest = niceMaximum(Math.max(0, ...data.map((bar) => bar.value)));
  const lowest = niceMaximum(Math.max(0, ...data.map((bar) => -bar.value)));
  const hasNegative = data.some((bar) => bar.value < 0);
  const hasPositive = data.some((bar) => bar.value > 0) || !hasNegative;
  const above = hasPositive ? highest : 0;
  const below = hasNegative ? lowest : 0;
  const span = above + below || 1;
  const zero = top + (above / span) * plotHeight;
  const slot = (width - left * 2) / data.length;
  const thickness = Math.min(24, slot * 0.6);
  const labelEvery = data.length > 12 ? 2 : 1;

  return (
    <ChartFrame label={label} table={table} legend={legend}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {hasPositive && <line className={styles.grid} x1={left} x2={width - left} y1={top} y2={top} />}
        {hasNegative && <line className={styles.grid} x1={left} x2={width - left} y1={top + plotHeight} y2={top + plotHeight} />}
        {hasPositive && (
          <text className={styles.axisLabel} x={width - left} y={top - 4} textAnchor="end">
            {formatValue(above)}
          </text>
        )}
        {hasNegative && (
          <text className={styles.axisLabel} x={width - left} y={top + plotHeight - 4} textAnchor="end">
            −{formatValue(below)}
          </text>
        )}
        {data.map((bar, index) => {
          const size = Math.max((Math.abs(bar.value) / span) * plotHeight, bar.value !== 0 ? 2 : 0);
          const x = left + index * slot + (slot - thickness) / 2;
          const radius = Math.min(4, size / 2);
          const up = bar.value >= 0;
          return (
            <g key={bar.label} className={styles.mark}>
              <title>{`${bar.label}: ${bar.value < 0 ? negativeLabel : positiveLabel} ${formatValue(Math.abs(bar.value))}`}</title>
              <rect x={left + index * slot} y={top} width={slot} height={plotHeight} className={styles.hit} />
              {size > 0 && (
                <path
                  style={{ fill: up ? positive : negative }}
                  d={
                    up
                      ? `M${x},${zero} v-${size - radius} q0,-${radius} ${radius},-${radius} h${thickness - 2 * radius} q${radius},0 ${radius},${radius} v${size - radius} z`
                      : `M${x},${zero} v${size - radius} q0,${radius} ${radius},${radius} h${thickness - 2 * radius} q${radius},0 ${radius},-${radius} v-${size - radius} z`
                  }
                />
              )}
              {index % labelEvery === 0 && (
                <text x={left + index * slot + slot / 2} y={height - 8} className={styles.axisLabel} textAnchor="middle">
                  {bar.label}
                </text>
              )}
            </g>
          );
        })}
        <line className={styles.baseline} x1={left} x2={width - left} y1={zero} y2={zero} />
      </svg>
    </ChartFrame>
  );
}
