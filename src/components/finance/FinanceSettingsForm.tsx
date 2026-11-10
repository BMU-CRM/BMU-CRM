'use client';

import { useActionState } from 'react';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { Panel } from '@/components/ui/Panel';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { stateOptionsWith } from '@/lib/finance/indianStates';
import { saveFinanceSettingsAction } from '@/server/actions/financeActions';
import type { FinanceSettings } from '@/server/services/financeService';

export function FinanceSettingsForm({ settings }: { settings: FinanceSettings }) {
  const [result, formAction] = useActionState(saveFinanceSettingsAction, idleResult);
  const errors = result.fieldErrors;

  return (
    <KeepValuesForm action={formAction}>
      <div className={layout.stack}>
        <FormMessage result={result} />
        <Panel title="Company details" description="Printed at the top of every quotation and invoice.">
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

        <Panel title="Payment and terms" description="Printed on documents. Changes apply to new quotations and invoices only.">
          <TextAreaField
            label="Bank details"
            name="bankDetails"
            rows={4}
            defaultValue={settings.bank_details ?? ''}
            placeholder={'Account name\nBank and branch\nAccount number\nIFSC\nUPI ID'}
            hint="Shown on invoices that still have money due."
            error={errors?.bankDetails}
          />
          <div className={layout.spaced}>
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
