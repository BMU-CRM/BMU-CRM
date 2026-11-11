import { axisMaximum, ChartFrame } from './ChartFrame';
import styles from './LineChart.module.css';

type Point = { label: string; value: number };

type LineChartProps = {
  label: string;
  points: Point[];
  formatValue?: (value: number) => string;
  valueHeading?: string;
};

const defaultFormat = (value: number) => value.toLocaleString('en-IN');

// One series over time: a 2px line over a faint wash, the last value labelled at its
// end, a dot on every point with a hover label, and the figures in a table.
export function LineChart({ label, points, formatValue = defaultFormat, valueHeading = 'Value' }: LineChartProps) {
  const table = { columns: ['', valueHeading], rows: points.map((point) => [point.label, formatValue(point.value)]) };
  if (points.length === 0) {
    return <p className={styles.empty}>Nothing to show yet.</p>;
  }

  const width = 600;
  const height = 220;
  const top = 18;
  const bottom = 26;
  const left = 8;
  const right = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = axisMaximum(points.map((point) => point.value));
  const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight * (1 - value / maximum);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${top + plotHeight} L${x(0)},${top + plotHeight} Z`;
  const last = points[points.length - 1] as Point;
  const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <ChartFrame label={label} table={table}>
      <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {[0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line className={styles.grid} x1={left} x2={left + plotWidth} y1={y(maximum * fraction)} y2={y(maximum * fraction)} />
            <text className={styles.axisLabel} x={left + plotWidth + 6} y={y(maximum * fraction)} dominantBaseline="middle">
              {formatValue(maximum * fraction)}
            </text>
          </g>
        ))}
        <line className={styles.baseline} x1={left} x2={left + plotWidth} y1={top + plotHeight} y2={top + plotHeight} />
        <path className={styles.area} d={area} />
        <path className={styles.line} d={path} />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`} className={styles.mark}>
            <title>{`${point.label}: ${formatValue(point.value)}`}</title>
            <circle className={styles.hit} cx={x(index)} cy={y(point.value)} r={10} />
            <circle className={styles.dot} cx={x(index)} cy={y(point.value)} r={index === points.length - 1 ? 4 : 3} />
          </g>
        ))}
        <text className={styles.endLabel} x={x(points.length - 1)} y={y(last.value) - 10} textAnchor="end">
          {formatValue(last.value)}
        </text>
        {tickIndexes.map((index) => (
          <text
            key={index}
            className={styles.axisLabel}
            x={x(index)}
            y={height - 6}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
          >
            {points[index]?.label}
          </text>
        ))}
      </svg>
    </ChartFrame>
  );
}
