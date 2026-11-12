import Link from 'next/link';
import { PrintButton } from '@/components/finance/PrintButton';
import styles from '@/components/payroll/PayslipPrint.module.css';
import { amountInWords, formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { paymentMethodLabels } from '@/lib/validation/payrollSchema';
import type { Resignation, Settlement } from '@/server/services/exitService';

type SettlementPrintProps = {
  resignation: Resignation;
  settlement: Settlement;
  company: { legal_name: string | null; address: string | null } | null;
};

// The full and final statement, laid out like a payslip.
export function SettlementPrint({ resignation, settlement, company }: SettlementPrintProps) {
  const owed: [string, number][] = [
    ['Pending salary', settlement.pending_salary],
    [`Leave encashment (${settlement.leave_encashment_days} days)`, settlement.leave_encashment_amount],
    ['Reimbursements due', settlement.reimbursements_due],
    ['Other amounts owed', settlement.other_earnings],
  ];
  const recovered: [string, number][] = [
    ['Notice period recovery', settlement.notice_recovery],
    ['Other deductions', settlement.other_deductions],
  ];
  const rows = Math.max(owed.length, recovered.length);
  const employee = resignation.employee;
  const final = settlement.final_amount ?? 0;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={`/hr/exits/${resignation.id}`}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <div>
            <p className={styles.company}>{company?.legal_name ?? 'Company name not set'}</p>
            {company?.address && <p className={styles.preserve}>{company.address}</p>}
          </div>
          <div className={styles.title}>
            <h1>Full and final settlement</h1>
            {settlement.status !== 'paid' && <p className={styles.stamp}>Not yet paid</p>}
          </div>
        </header>
        <dl className={styles.facts}>
          <div>
            <dt>Employee</dt>
            <dd>{employee?.full_name}</dd>
          </div>
          <div>
            <dt>Employee ID</dt>
            <dd>{employee?.employee_code}</dd>
          </div>
          <div>
            <dt>Designation</dt>
            <dd>{employee?.designation?.title ?? '—'}</dd>
          </div>
          <div>
            <dt>Joining date</dt>
            <dd>{employee?.joining_date ? formatDate(employee.joining_date) : '—'}</dd>
          </div>
          <div>
            <dt>Resigned on</dt>
            <dd>{formatDate(resignation.submitted_on)}</dd>
          </div>
          <div>
            <dt>Last working day</dt>
            <dd>{resignation.last_working_day ? formatDate(resignation.last_working_day) : '—'}</dd>
          </div>
        </dl>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Owed to the employee</th>
              <th scope="col" className={styles.number}>Amount</th>
              <th scope="col">Recovered</th>
              <th scope="col" className={styles.number}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => (
              <tr key={index}>
                <td>{owed[index]?.[0]}</td>
                <td className={styles.number}>{owed[index] ? formatRupees(owed[index][1]) : ''}</td>
                <td>{recovered[index]?.[0]}</td>
                <td className={styles.number}>{recovered[index] ? formatRupees(recovered[index][1]) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.net}>
          {final >= 0 ? 'Payable to the employee' : 'Recoverable from the employee'} <strong>{formatRupees(Math.abs(final))}</strong>
        </p>
        <p className={styles.words}>{amountInWords(Math.abs(final))}</p>
        {settlement.notes && <p className={styles.preserve}>Note: {settlement.notes}</p>}
        {settlement.status === 'paid' && settlement.paid_on && (
          <p className={styles.preserve}>
            Paid on {formatDate(settlement.paid_on)} by {paymentMethodLabels[settlement.payment_method ?? 'other']}
            {settlement.payment_reference ? `, reference ${settlement.payment_reference}` : ''}.
          </p>
        )}
        <p className={styles.footer}>I confirm I have received the above in full and final settlement of my dues. Signature: ______________________</p>
      </article>
    </div>
  );
}
