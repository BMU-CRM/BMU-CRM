import { AppLink as Link } from '@/components/ui/AppLink';
import { PrintButton } from '@/components/finance/PrintButton';
import { amountInWords, formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import type { PayrollLine } from '@/server/services/payrollService';
import { payslipRows } from './PayslipBreakdown';
import styles from './PayslipPrint.module.css';

type PayslipPrintProps = {
  line: PayrollLine;
  company: { legal_name: string | null; address: string | null } | null;
  backHref: string;
};

// A payslip laid out for paper or PDF. Always black on white.
export function PayslipPrint({ line, company, backHref }: PayslipPrintProps) {
  const { earnings, deductions } = payslipRows(line);
  const rows = Math.max(earnings.length, deductions.length);
  const isDraft = line.run?.status !== 'paid';

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={backHref}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <div>
            <p className={styles.company}>{company?.legal_name ?? 'Company name not set'}</p>
            {company?.address && <p className={styles.preserve}>{company.address}</p>}
          </div>
          <div className={styles.title}>
            <h1>Payslip</h1>
            <p>{line.run ? formatPayrollMonth(line.run.month) : ''}</p>
            {isDraft && <p className={styles.stamp}>Draft, not yet paid</p>}
          </div>
        </header>

        <dl className={styles.facts}>
          <div>
            <dt>Employee</dt>
            <dd>{line.employee?.full_name}</dd>
          </div>
          <div>
            <dt>Employee ID</dt>
            <dd>{line.employee?.employee_code}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{line.employee?.department?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Designation</dt>
            <dd>{line.employee?.designation?.title ?? '—'}</dd>
          </div>
          <div>
            <dt>Joining date</dt>
            <dd>{line.employee?.joining_date ? formatDate(line.employee.joining_date) : '—'}</dd>
          </div>
          <div>
            <dt>Paid days</dt>
            <dd>
              {line.paid_days} of {line.days_in_month}
              {line.lop_days > 0 ? ` (${line.lop_days} loss of pay)` : ''}
            </dd>
          </div>
          {line.run?.paid_on && (
            <div>
              <dt>Paid on</dt>
              <dd>{formatDate(line.run.paid_on)}</dd>
            </div>
          )}
        </dl>

        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Earnings</th>
              <th scope="col" className={styles.number}>Amount</th>
              <th scope="col">Deductions</th>
              <th scope="col" className={styles.number}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => (
              <tr key={index}>
                <td>{earnings[index]?.[0]}</td>
                <td className={styles.number}>{earnings[index] ? formatRupees(earnings[index][1]) : ''}</td>
                <td>{deductions[index]?.[0]}</td>
                <td className={styles.number}>{deductions[index] ? formatRupees(deductions[index][1]) : ''}</td>
              </tr>
            ))}
            <tr className={styles.totals}>
              <td>Gross earnings</td>
              <td className={styles.number}>{formatRupees(line.gross_earnings)}</td>
              <td>Total deductions</td>
              <td className={styles.number}>{formatRupees(line.total_deductions)}</td>
            </tr>
          </tbody>
        </table>

        <p className={styles.net}>
          Net pay <strong>{formatRupees(line.net_pay)}</strong>
        </p>
        <p className={styles.words}>{amountInWords(line.net_pay)}</p>
        {line.notes && <p className={styles.preserve}>Note: {line.notes}</p>}
        <p className={styles.footer}>This is a computer-generated payslip and needs no signature.</p>
      </article>
    </div>
  );
}
