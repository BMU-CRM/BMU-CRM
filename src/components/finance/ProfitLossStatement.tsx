import { Fragment } from 'react';
import tableStyles from '@/components/ui/DataTable.module.css';
import { formatDate } from '@/lib/formatDate';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { compareSection, percentChange, type ProfitLossSection } from '@/lib/finance/profitLoss';
import type { ProfitLossComparison } from '@/server/services/profitLossService';
import styles from './ProfitLossStatement.module.css';

const sections: { key: ProfitLossSection; title: string; total: string }[] = [
  { key: 'revenue', title: 'Revenue', total: 'Total revenue' },
  { key: 'salaries', title: 'Salary expenses', total: 'Total salary expenses' },
  { key: 'operating', title: 'Operating expenses', total: 'Total operating expenses' },
];

function Change({ current, earlier, expense }: { current: number; earlier: number; expense?: boolean }) {
  const change = percentChange(current, earlier);
  if (change === null) return <span className={styles.change}>—</span>;
  // Rising revenue is good; rising costs are not.
  const better = expense ? change < 0 : change > 0;
  return (
    <span className={styles.change} data-better={change === 0 ? undefined : better}>
      {change > 0 ? '+' : ''}
      {change}%
    </span>
  );
}

// The statement for a period beside the period before and the same period last year.
export function ProfitLossStatement({ data }: { data: ProfitLossComparison }) {
  const { current, previous, lastYear, ranges } = data;
  const period = (range: { from: string; to: string }) => `${formatDate(range.from)} to ${formatDate(range.to)}`;
  const totalRow = (label: string, key: 'revenue' | 'salaries' | 'operating' | 'expenses' | 'net', expense: boolean, strong = false) => (
    <tr className={strong ? styles.net : styles.total}>
      <th scope="row">{label}</th>
      <td className={tableStyles.numeric}>{formatRupees(current.totals[key])}</td>
      <td className={tableStyles.numeric}>{formatRupees(previous.totals[key])}</td>
      <td className={tableStyles.numeric}>{formatRupees(lastYear.totals[key])}</td>
      <td className={tableStyles.numeric}>
        <Change current={current.totals[key]} earlier={previous.totals[key]} expense={expense} />
      </td>
    </tr>
  );

  return (
    <div className={tableStyles.scroller}>
      <table className={`${tableStyles.table} ${styles.statement}`}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" className={tableStyles.numeric}>
              This period
              <span className={styles.range}>{period(ranges.current)}</span>
            </th>
            <th scope="col" className={tableStyles.numeric}>
              Period before
              <span className={styles.range}>{period(ranges.previous)}</span>
            </th>
            <th scope="col" className={tableStyles.numeric}>
              Same period last year
              <span className={styles.range}>{period(ranges.lastYear)}</span>
            </th>
            <th scope="col" className={tableStyles.numeric}>
              Change
              <span className={styles.range}>on the period before</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const lines = compareSection(section.key, current, previous, lastYear);
            const expense = section.key !== 'revenue';
            return (
              <Fragment key={section.key}>
                <tr className={styles.heading}>
                  <th scope="rowgroup" colSpan={5}>
                    {section.title}
                  </th>
                </tr>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={tableStyles.secondaryText}>
                      Nothing in these periods.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.label}>
                      <th scope="row" className={styles.line}>
                        {line.label}
                      </th>
                      <td className={tableStyles.numeric}>{formatRupees(line.current)}</td>
                      <td className={tableStyles.numeric}>{formatRupees(line.previous)}</td>
                      <td className={tableStyles.numeric}>{formatRupees(line.lastYear)}</td>
                      <td className={tableStyles.numeric}>
                        <Change current={line.current} earlier={line.previous} expense={expense} />
                      </td>
                    </tr>
                  ))
                )}
                {totalRow(section.total, section.key, expense)}
              </Fragment>
            );
          })}
          {totalRow('Total expenses', 'expenses', true)}
          {totalRow(current.totals.net >= 0 ? 'Net profit' : 'Net loss', 'net', false, true)}
        </tbody>
      </table>
    </div>
  );
}
