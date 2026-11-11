import Link from 'next/link';
import { PrintButton } from '@/components/finance/PrintButton';
import {
  employmentStatusLabels,
  genderLabels,
  maskAadhaar,
  maskAccount,
} from '@/lib/employees/employeeRecordLabels';
import { formatDate } from '@/lib/formatDate';
import type { EmployeeDetails, PersonalDetails, PrivateDetails } from '@/server/services/employeeService';
import styles from './EmployeeProfilePrint.module.css';

type EmployeeProfilePrintProps = {
  employee: EmployeeDetails;
  personal: PersonalDetails | null | undefined;
  privateDetails: PrivateDetails | null | undefined;
  printedOn: string;
};

type Fact = [label: string, value: string | null | undefined];

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className={styles.facts}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// An employee's record laid out for paper or PDF. Personal and bank sections appear
// only for people allowed to see them, and numbers stay masked.
export function EmployeeProfilePrint({ employee, personal, privateDetails, printedOn }: EmployeeProfilePrintProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={`/people/employees/${employee.id}`}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <div>
            <h1 className={styles.name}>{employee.full_name}</h1>
            <p>{[employee.designation?.title, employee.department?.name].filter(Boolean).join(' · ') || 'No designation'}</p>
          </div>
          <p className={styles.code}>{employee.employee_code}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.heading}>Employment</h2>
          <FactList
            facts={[
              ['Work email', employee.work_email],
              ['Phone', employee.phone],
              ['Role', employee.role?.name],
              ['Reports to', employee.manager?.full_name],
              ['Joining date', employee.joining_date && formatDate(employee.joining_date)],
              ['Employment type', employee.employment_type?.name],
              ['Employment status', employmentStatusLabels[employee.employment_status]],
              ['Probation', employee.probation_months === null ? null : `${employee.probation_months} months`],
              ['Probation ends', employee.probation_end_date && formatDate(employee.probation_end_date)],
              ['Confirmation date', employee.confirmation_date && formatDate(employee.confirmation_date)],
              ['Skills', employee.skills.join(', ')],
            ]}
          />
        </section>

        {personal !== undefined && (
          <section className={styles.section}>
            <h2 className={styles.heading}>Personal</h2>
            <FactList
              facts={[
                ['Date of birth', personal?.date_of_birth && formatDate(personal.date_of_birth)],
                ['Gender', personal?.gender && genderLabels[personal.gender]],
                ['Personal email', personal?.personal_email],
                ['Address', personal?.address],
                ['Emergency contact', [personal?.emergency_contact_name, personal?.emergency_contact_relation].filter(Boolean).join(', ')],
                ['Emergency phone', personal?.emergency_contact_phone],
              ]}
            />
          </section>
        )}

        {privateDetails !== undefined && (
          <section className={styles.section}>
            <h2 className={styles.heading}>ID and bank</h2>
            <FactList
              facts={[
                ['Aadhaar', maskAadhaar(privateDetails?.aadhaar_last4 ?? null)],
                ['PAN', privateDetails?.pan],
                ['Bank', privateDetails?.bank_name],
                ['Account number', maskAccount(privateDetails?.account_last4 ?? null)],
                ['IFSC', privateDetails?.ifsc],
                ['Account holder', privateDetails?.account_holder],
              ]}
            />
          </section>
        )}

        <p className={styles.footer}>Printed on {formatDate(printedOn)}. Confidential.</p>
      </article>
    </div>
  );
}
