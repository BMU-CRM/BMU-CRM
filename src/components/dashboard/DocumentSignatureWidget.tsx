import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import type { CurrentAccess } from '@/server/services/accessService';
import { getSavedSignature } from '@/server/services/signatureService';
import styles from './DashboardWidgets.module.css';

// Whether the signature and seal for quotations, invoices and receipts are uploaded.
export async function DocumentSignatureWidget({ access }: { access: CurrentAccess }) {
  const saved = await getSavedSignature(access.employee.id);
  const title = saved?.signatory_title ?? access.employee.role?.name ?? 'Authorised signatory';

  return (
    <Panel
      title="Signature and seal"
      action={
        <ButtonLink href="/profile#signature" variant="ghost">
          {saved?.signature_image ? 'Change' : 'Upload'}
        </ButtonLink>
      }
    >
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Signature</dt>
          <dd>{saved?.signature_image ? 'Uploaded' : 'Not uploaded'}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Company seal</dt>
          <dd>{saved?.seal_image ? 'Uploaded' : 'Not uploaded'}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Printed under it</dt>
          <dd>
            {access.employee.full_name}, {title}
          </dd>
        </div>
      </dl>
      {!saved?.signature_image && (
        <p className={styles.muted}>Upload them once to add them to the quotations, invoices and receipts you prepare.</p>
      )}
    </Panel>
  );
}
