import { formatRupees } from '@/lib/finance/moneyFormat';
import type { PayrollLine, PayslipComponent } from '@/server/services/payrollService';
import styles from './PayslipBreakdown.module.css';

type Row = [label: string, amount: number];

// Every line of a payslip, earnings beside deductions. Zero lines are left out.
export function payslipRows(line: PayrollLine) {
  const components = (line.components ?? []) as PayslipComponent[];
  const earnings: Row[] = [
    ['Basic', line.basic],
    ['HRA', line.hra],
    ['Other allowances', line.other_allowances],
    ['Special allowance', line.special_allowance],
    ['Incentive', line.incentive],
    ['Bonus', line.bonus],
    ['Overtime', line.overtime_amount],
    ['Other earnings', line.other_earnings],
    ...components.filter((item) => item.kind === 'earning').map((item): Row => [item.name, item.amount]),
  ];
  const deductions: Row[] = [
    ['Provident fund', line.pf_employee],
    ['ESI', line.esi_employee],
    ['Professional tax', line.professional_tax],
    ['TDS', line.tds],
    ['Other deductions', line.other_deductions],
    ...components.filter((item) => item.kind === 'deduction').map((item): Row => [item.name, item.amount]),
  ];
  return {
    earnings: earnings.filter(([, value]) => value > 0),
    deductions: deductions.filter(([, value]) => value > 0),
  };
}

export function PayslipBreakdown({ line }: { line: PayrollLine }) {
  const { earnings, deductions } = payslipRows(line);
  return (
    <div className={styles.breakdown}>
      <p className={styles.days}>
        {line.paid_days} of {line.days_in_month} days paid
        {line.lop_days > 0 ? ` · ${line.lop_days} days loss of pay (${line.unpaid_leave_days} unpaid leave, ${line.absent_days} without attendance${line.lop_adjustment ? `, ${line.lop_adjustment > 0 ? '+' : ''}${line.lop_adjustment} changed by HR` : ''})` : ''}
      </p>
      <div className={styles.columns}>
        <dl className={styles.list}>
          <dt className={styles.heading}>Earnings</dt>
          <dd className={styles.heading} />
          {earnings.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{formatRupees(value)}</dd>
            </div>
          ))}
          <div className={`${styles.row} ${styles.total}`}>
            <dt>Gross</dt>
            <dd>{formatRupees(line.gross_earnings)}</dd>
          </div>
        </dl>
        <dl className={styles.list}>
          <dt className={styles.heading}>Deductions</dt>
          <dd className={styles.heading} />
          {deductions.length === 0 && (
            <div className={styles.row}>
              <dt>None</dt>
              <dd />
            </div>
          )}
          {deductions.map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{formatRupees(value)}</dd>
            </div>
          ))}
          <div className={`${styles.row} ${styles.total}`}>
            <dt>Total deductions</dt>
            <dd>{formatRupees(line.total_deductions)}</dd>
          </div>
        </dl>
      </div>
      <p className={styles.net}>
        Net pay <strong>{formatRupees(line.net_pay)}</strong>
      </p>
    </div>
  );
}
