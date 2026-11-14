'use client';

import { useActionState, useEffect, useState } from 'react';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { Panel } from '@/components/ui/Panel';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { stateOptionsWith } from '@/lib/finance/indianStates';
import { saveFinanceSettingsAction } from '@/server/actions/financeActions';
import type { FinanceSettings } from '@/server/services/financeService';
import styles from './FinanceSettingsForm.module.css';

// The UPI QR code printed beside the payment details, with a preview of a newly
// chosen image before it is saved.
function UpiQrField({ saved, error }: { saved: string | null; error?: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => () => (chosen ? URL.revokeObjectURL(chosen) : undefined), [chosen]);
  const shown = chosen ?? saved;
  return (
    <div className={styles.qrField}>
      <div className={formStyles.field}>
        <label htmlFor="upi-qr" className={formStyles.label}>
          UPI QR code
        </label>
        <input
          id="upi-qr"
          name="upiQr"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className={formStyles.control}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setChosen(file ? URL.createObjectURL(file) : null);
          }}
        />
        <p className={formStyles.hint}>The QR code from your bank or UPI app. Printed with &ldquo;Scan to pay via UPI&rdquo;.</p>
        {error && <p className={formStyles.error}>{error}</p>}
        {saved && (
          <label className={formStyles.hint}>
            <input type="checkbox" name="removeUpiQr" /> Remove the saved QR code
          </label>
        )}
      </div>
      {shown && (
        <figure className={styles.qrPreview}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
          <img src={shown} alt="UPI QR code" width={120} height={120} />
          <figcaption>{chosen ? 'Not saved yet' : 'Saved'}</figcaption>
        </figure>
      )}
    </div>
  );
}

export function FinanceSettingsForm({ settings }: { settings: FinanceSettings }) {
  const [result, formAction] = useActionState(saveFinanceSettingsAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <div className={layout.stack}>
        <FormMessage result={result} />
        <Panel title="Company details" description="Printed on every quotation, invoice and receipt.">
          <FormGrid>
            <TextField label="Legal name" name="legalName" defaultValue={settings.legal_name ?? ''} error={errors?.legalName} />
            <TextField label="GSTIN" name="gstin" defaultValue={settings.gstin ?? ''} maxLength={15} error={errors?.gstin} />
            <TextField label="PAN" name="pan" defaultValue={settings.pan ?? ''} maxLength={10} error={errors?.pan} />
            <SelectField
              label="State"
              name="state"
              options={stateOptionsWith(settings.state)}
              placeholder="Not set"
              defaultValue={settings.state ?? ''}
              hint="Sales within this state are charged CGST and SGST. Sales anywhere else are charged IGST."
              error={errors?.state}
            />
            <TextField label="Email" name="email" type="email" defaultValue={settings.email ?? ''} error={errors?.email} />
            <TextField label="Phone" name="phone" type="tel" defaultValue={settings.phone ?? ''} error={errors?.phone} />
            <TextField label="Website" name="website" defaultValue={settings.website ?? ''} placeholder="https://www.example.com" error={errors?.website} />
          </FormGrid>
          <div className={layout.spaced}>
            <TextAreaField label="Address" name="address" rows={3} defaultValue={settings.address ?? ''} error={errors?.address} />
          </div>
        </Panel>

        <Panel title="Numbering and defaults">
          <FormGrid>
            <TextField
              label="Invoice number prefix"
              name="invoicePrefix"
              defaultValue={settings.invoice_prefix}
              maxLength={5}
              required
              hint="Invoices are numbered PREFIX/26-27/0001, starting again each financial year."
              error={errors?.invoicePrefix}
            />
            <TextField
              label="Receipt number prefix"
              name="receiptPrefix"
              defaultValue={settings.receipt_prefix}
              maxLength={5}
              required
              hint="Each invoice payment gets a receipt, numbered PREFIX/26-27/0001."
              error={errors?.receiptPrefix}
            />
            <TextField
              label="Purchase order prefix"
              name="poPrefix"
              defaultValue={settings.po_prefix}
              maxLength={5}
              required
              hint="Purchase orders are numbered PREFIX/26-27/0001 when issued."
              error={errors?.poPrefix}
            />
            <TextField
              label="Usual GST rate (%)"
              name="defaultTaxRate"
              inputMode="decimal"
              defaultValue={String(settings.default_tax_rate)}
              required
              hint="Filled in on each new item. It can be changed per item."
              error={errors?.defaultTaxRate}
            />
            <TextField
              label="Payment terms (days)"
              name="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              defaultValue={String(settings.payment_terms_days)}
              required
              hint="Sets the due date when none is chosen."
              error={errors?.paymentTermsDays}
            />
            <TextField
              label="Quotations valid for (days)"
              name="quotationValidityDays"
              type="number"
              min={1}
              max={365}
              defaultValue={String(settings.quotation_validity_days)}
              required
              error={errors?.quotationValidityDays}
            />
          </FormGrid>
        </Panel>

        <Panel title="Payment details" description="Printed in a box on quotations, and on invoices that still have money due.">
          <FormGrid>
            <TextField label="Account name" name="bankAccountName" defaultValue={settings.bank_account_name ?? ''} error={errors?.bankAccountName} />
            <TextField label="Account number" name="bankAccountNumber" defaultValue={settings.bank_account_number ?? ''} error={errors?.bankAccountNumber} />
            <TextField label="IFSC" name="bankIfsc" defaultValue={settings.bank_ifsc ?? ''} maxLength={11} error={errors?.bankIfsc} />
            <TextField label="SWIFT code" name="bankSwift" defaultValue={settings.bank_swift ?? ''} maxLength={11} hint="For payments from abroad." error={errors?.bankSwift} />
            <TextField label="Bank and branch" name="bankName" defaultValue={settings.bank_name ?? ''} error={errors?.bankName} />
            <TextField label="UPI ID" name="upiId" defaultValue={settings.upi_id ?? ''} placeholder="name@bank" error={errors?.upiId} />
          </FormGrid>
          <div className={layout.spaced}>
            <UpiQrField saved={settings.upi_qr_image} error={errors?.upiQr} />
          </div>
          <div className={layout.spaced}>
            <TextAreaField
              label="Other payment notes"
              name="bankDetails"
              rows={2}
              defaultValue={settings.bank_details ?? ''}
              hint="Printed under the account, for example: Please quote the invoice number."
              error={errors?.bankDetails}
            />
          </div>
        </Panel>

        <Panel title="Terms" description="Printed on documents. Changes apply to new quotations and invoices only.">
          <div>
            <TextAreaField label="Invoice terms" name="invoiceTerms" rows={3} defaultValue={settings.invoice_terms ?? ''} error={errors?.invoiceTerms} />
          </div>
          <div className={layout.spaced}>
            <TextAreaField
              label="Quotation terms"
              name="quotationTerms"
              rows={3}
              defaultValue={settings.quotation_terms ?? ''}
              error={errors?.quotationTerms}
            />
          </div>
        </Panel>
      </div>
      <FormActions>
        <SubmitButton label="Save settings" pendingLabel="Saving…" />
      </FormActions>
    </KeepValuesForm>
  );
}
