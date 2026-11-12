import { axisMaximum, ChartFrame, seriesColours } from './ChartFrame';
import styles from './BarChart.module.css';

type Group = { label: string; values: number[] };

type GroupedBarChartProps = {
  label: string;
  // Two or three series, such as money in and money out, in the fixed colour order.
  series: string[];
  groups: Group[];
  formatValue?: (value: number) => string;
};

const defaultFormat = (value: number) => value.toLocaleString('en-IN');

// Several series side by side for each period (usually months): thin bars with 4px
// rounded ends, a 2px gap between neighbours, a key and the figures in a table.
export function GroupedBarChart({ label, series, groups, formatValue = defaultFormat }: GroupedBarChartProps) {
  const table = { columns: ['', ...series], rows: groups.map((group) => [group.label, ...group.values.map(formatValue)]) };
  const legend = series.map((name, index) => ({
    label: name,
    colour: seriesColours[index] ?? seriesColours[0],
    value: formatValue(groups.reduce((sum, group) => sum + (group.values[index] ?? 0), 0)),
  }));
  if (groups.length === 0) {
    return <p className={styles.empty}>Nothing to show yet.</p>;
  }

  const width = 600;
  const height = 240;
  const top = 16;
  const bottom = 28;
  const left = 8;
  const plotHeight = height - top - bottom;
  const slot = (width - left * 2) / groups.length;
  const gap = 2;
  const thickness = Math.min(14, (slot * 0.7 - gap * (series.length - 1)) / series.length);
  const groupWidth = thickness * series.length + gap * (series.length - 1);
  const maximum = axisMaximum(groups.flatMap((group) => group.values));
  const labelEvery = groups.length > 12 ? 2 : 1;

  return (
    <ChartFrame label={label} table={table} legend={legend}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {[0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line className={styles.grid} x1={left} x2={width - left} y1={top + plotHeight * (1 - fraction)} y2={top + plotHeight * (1 - fraction)} />
            <text className={styles.axisLabel} x={width - left} y={top + plotHeight * (1 - fraction) - 4} textAnchor="end">
              {formatValue(maximum * fraction)}
            </text>
          </g>
        ))}
        <line className={styles.baseline} x1={left} x2={width - left} y1={top + plotHeight} y2={top + plotHeight} />
        {groups.map((group, groupIndex) => {
          const start = left + groupIndex * slot + (slot - groupWidth) / 2;
          return (
            <g key={group.label} className={styles.mark}>
              <title>{`${group.label}: ${series.map((name, index) => `${name} ${formatValue(group.values[index] ?? 0)}`).join(', ')}`}</title>
              <rect x={left + groupIndex * slot} y={top} width={slot} height={plotHeight} className={styles.hit} />
              {group.values.map((value, index) => {
                const barHeight = Math.max((value / maximum) * plotHeight, value > 0 ? 2 : 0);
                if (barHeight <= 0) return null;
                const x = start + index * (thickness + gap);
                const radius = Math.min(4, barHeight / 2, thickness / 2);
                return (
                  <path
                    key={index}
                    style={{ fill: seriesColours[index] ?? seriesColours[0] }}
                    d={`M${x},${top + plotHeight} v-${barHeight - radius} q0,-${radius} ${radius},-${radius} h${thickness - 2 * radius} q${radius},0 ${radius},${radius} v${barHeight - radius} z`}
                  />
                );
              })}
              {groupIndex % labelEvery === 0 && (
                <text x={left + groupIndex * slot + slot / 2} y={height - 8} className={styles.axisLabel} textAnchor="middle">
                  {group.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
