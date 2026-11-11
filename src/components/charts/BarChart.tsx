import { axisMaximum, ChartFrame } from './ChartFrame';
import styles from './BarChart.module.css';

type Bar = { label: string; value: number };

type BarChartProps = {
  label: string;
  data: Bar[];
  // "horizontal" for named categories (departments), "vertical" for time (months).
  orientation?: 'horizontal' | 'vertical';
  formatValue?: (value: number) => string;
  valueHeading?: string;
};

const defaultFormat = (value: number) => value.toLocaleString('en-IN');

// One series as bars from a single baseline: 4px rounded ends, square at the baseline,
// at most 24px thick, a value at each tip, and the figures in a table underneath.
export function BarChart({ label, data, orientation = 'horizontal', formatValue = defaultFormat, valueHeading = 'Value' }: BarChartProps) {
  const table = { columns: ['', valueHeading], rows: data.map((bar) => [bar.label, formatValue(bar.value)]) };
  if (data.length === 0) {
    return <p className={styles.empty}>Nothing to show yet.</p>;
  }

  const maximum = axisMaximum(data.map((bar) => bar.value));

  if (orientation === 'horizontal') {
    const labelWidth = 150;
    const plotWidth = 380;
    const rowHeight = 32;
    const thickness = 16;
    const height = data.length * rowHeight + 8;
    return (
      <ChartFrame label={label} table={table}>
        <svg className={styles.chart} viewBox={`0 0 ${labelWidth + plotWidth + 70} ${height}`} role="img" aria-label={label}>
          <line className={styles.baseline} x1={labelWidth} x2={labelWidth} y1={0} y2={height - 4} />
          {data.map((bar, index) => {
            const y = index * rowHeight + (rowHeight - thickness) / 2;
            const width = Math.max((bar.value / maximum) * plotWidth, bar.value > 0 ? 2 : 0);
            const radius = Math.min(4, width / 2);
            return (
              <g key={bar.label} className={styles.mark}>
                <title>{`${bar.label}: ${formatValue(bar.value)}`}</title>
                {/* A wider invisible band, so the hover target is bigger than the bar. */}
                <rect x={0} y={index * rowHeight} width={labelWidth + plotWidth + 70} height={rowHeight} className={styles.hit} />
                <text x={labelWidth - 10} y={y + thickness / 2} className={styles.category} dominantBaseline="middle" textAnchor="end">
                  {bar.label.length > 22 ? `${bar.label.slice(0, 21)}…` : bar.label}
                </text>
                {width > 0 && (
                  <path
                    className={styles.bar}
                    d={`M${labelWidth},${y} h${width - radius} q${radius},0 ${radius},${radius} v${thickness - 2 * radius} q0,${radius} -${radius},${radius} h-${width - radius} z`}
                  />
                )}
                <text x={labelWidth + width + 8} y={y + thickness / 2} className={styles.value} dominantBaseline="middle">
                  {formatValue(bar.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </ChartFrame>
    );
  }

  const width = 600;
  const height = 240;
  const top = 16;
  const bottom = 28;
  const left = 8;
  const plotHeight = height - top - bottom;
  const slot = (width - left * 2) / data.length;
  const thickness = Math.min(24, slot * 0.6);
  // Label every month when there is room, otherwise every other one.
  const labelEvery = data.length > 12 ? 2 : 1;

  return (
    <ChartFrame label={label} table={table}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {[0.5, 1].map((fraction) => (
          <line key={fraction} className={styles.grid} x1={left} x2={width - left} y1={top + plotHeight * (1 - fraction)} y2={top + plotHeight * (1 - fraction)} />
        ))}
        <line className={styles.baseline} x1={left} x2={width - left} y1={top + plotHeight} y2={top + plotHeight} />
        {data.map((bar, index) => {
          const barHeight = Math.max((bar.value / maximum) * plotHeight, bar.value > 0 ? 2 : 0);
          const x = left + index * slot + (slot - thickness) / 2;
          const y = top + plotHeight - barHeight;
          const radius = Math.min(4, barHeight / 2);
          const isMax = bar.value === Math.max(...data.map((item) => item.value)) && bar.value > 0;
          return (
            <g key={bar.label} className={styles.mark}>
              <title>{`${bar.label}: ${formatValue(bar.value)}`}</title>
              <rect x={left + index * slot} y={top} width={slot} height={plotHeight} className={styles.hit} />
              {barHeight > 0 && (
                <path
                  className={styles.bar}
                  d={`M${x},${top + plotHeight} v-${barHeight - radius} q0,-${radius} ${radius},-${radius} h${thickness - 2 * radius} q${radius},0 ${radius},${radius} v${barHeight - radius} z`}
                />
              )}
              {/* Only the highest value is labelled; the table and hover carry the rest. */}
              {isMax && (
                <text x={x + thickness / 2} y={y - 6} className={styles.value} textAnchor="middle">
                  {formatValue(bar.value)}
                </text>
              )}
              {index % labelEvery === 0 && (
                <text x={left + index * slot + slot / 2} y={height - 8} className={styles.axisLabel} textAnchor="middle">
                  {bar.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
