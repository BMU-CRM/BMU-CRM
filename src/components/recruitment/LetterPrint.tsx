import Link from 'next/link';
import { PrintButton } from '@/components/finance/PrintButton';
import styles from './LetterPrint.module.css';

type LetterPrintProps = {
  company: { legal_name: string | null; address: string | null } | null;
  date: string;
  to: string | null;
  subject: string;
  body: string;
  backHref: string;
};

// A letter on plain paper, under the company name and address, with a signature line.
export function LetterPrint({ company, date, to, subject, body, backHref }: LetterPrintProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={backHref}>← Back</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet}>
        <header className={styles.top}>
          <p className={styles.company}>{company?.legal_name ?? 'Company name not set'}</p>
          {company?.address && <p className={styles.preserve}>{company.address}</p>}
        </header>
        <p className={styles.date}>{date}</p>
        {to && <p className={styles.to}>To: {to}</p>}
        <h1 className={styles.subject}>{subject}</h1>
        <div className={styles.body}>{body}</div>
        <div className={styles.signature}>
          <span className={styles.signatureLine}>For {company?.legal_name ?? 'the company'}</span>
          <p>Authorised signatory</p>
        </div>
      </article>
    </div>
  );
}
