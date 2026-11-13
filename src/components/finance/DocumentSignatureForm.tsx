'use client';

import Image from 'next/image';
import { useActionState } from 'react';
import { FormActions, FormGrid, TextField } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { saveDocumentSignatureAction } from '@/server/actions/signatureActions';
import styles from './DocumentSignatureForm.module.css';

type DocumentSignatureFormProps = {
  name: string;
  roleName: string;
  companyName: string;
  title: string | null;
  signatureImage: string | null;
  sealImage: string | null;
};

// Your signature and the company seal, uploaded once and added to quotations, invoices
// and receipts you prepare. Shows how they print.
export function DocumentSignatureForm({ name, roleName, companyName, title, signatureImage, sealImage }: DocumentSignatureFormProps) {
  const [result, formAction] = useActionState(saveDocumentSignatureAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <form action={formAction} key={result.status === 'success' ? `saved-${signatureImage?.length ?? 0}-${sealImage?.length ?? 0}` : 'signature'}>
      <FormMessage result={result} />
      <div className={styles.layout}>
        <div>
          <FormGrid>
            <div className={formStyles.field}>
              <label htmlFor="signature-file" className={formStyles.label}>
                Your signature
              </label>
              <input id="signature-file" name="signature" type="file" accept="image/png,image/jpeg,image/webp" className={formStyles.control} aria-invalid={Boolean(errors?.signature)} />
              <p className={formStyles.hint}>Sign on white paper and take a clear photo, or use a PNG with a see-through background.</p>
              {errors?.signature && <p className={formStyles.error}>{errors.signature}</p>}
              {signatureImage && (
                <label className={styles.remove}>
                  <input type="checkbox" name="removeSignature" /> Remove my saved signature
                </label>
              )}
            </div>
            <div className={formStyles.field}>
              <label htmlFor="seal-file" className={formStyles.label}>
                Company seal
              </label>
              <input id="seal-file" name="seal" type="file" accept="image/png,image/jpeg,image/webp" className={formStyles.control} aria-invalid={Boolean(errors?.seal)} />
              <p className={formStyles.hint}>A photo or scan of the stamp. It prints beside your signature when you choose.</p>
              {errors?.seal && <p className={formStyles.error}>{errors.seal}</p>}
              {sealImage && (
                <label className={styles.remove}>
                  <input type="checkbox" name="removeSeal" /> Remove my saved seal
                </label>
              )}
            </div>
            <TextField
              label="Title under your name"
              name="title"
              defaultValue={title ?? ''}
              placeholder={roleName}
              maxLength={80}
              hint={`Leave empty to print your role (${roleName}). For example: Proprietor.`}
              error={errors?.title}
            />
          </FormGrid>
        </div>

        <figure className={styles.preview} aria-label="How it prints">
          <figcaption className={styles.previewLabel}>How it prints</figcaption>
          <p className={styles.forCompany}>For {companyName}</p>
          <div className={styles.marks}>
            {sealImage && <Image src={sealImage} alt="Company seal" width={88} height={88} unoptimized className={styles.seal} />}
            {signatureImage ? (
              <Image src={signatureImage} alt="Your signature" width={180} height={72} unoptimized className={styles.signature} />
            ) : (
              <span className={styles.empty}>No signature yet</span>
            )}
          </div>
          <span className={styles.line} />
          <p className={styles.signer}>
            {name}, {title || roleName}
          </p>
        </figure>
      </div>
      <FormActions>
        <SubmitButton label="Save signature and seal" pendingLabel="Saving…" />
      </FormActions>
    </form>
  );
}
