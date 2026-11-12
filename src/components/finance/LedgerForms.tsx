'use client';

import { useActionState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { idleResult } from '@/lib/actionResult';
import { bankAccountTypeLabels, bankAccountTypes } from '@/lib/validation/ledgerSchema';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import {
  importStatementAction,
  removeLedgerEntryAction,
  saveBankAccountAction,
  saveExpenseAction,
  saveFinanceCategoryAction,
  saveIncomeAction,
} from '@/server/actions/ledgerActions';
import styles from './LedgerForms.module.css';

const methodOptions = paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }));
const text = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value));

export type LedgerOptions = {
  categories: SelectOption[];
  accounts: SelectOption[];
  defaultAccountId: string;
  departments?: SelectOption[];
  clients?: SelectOption[];
  files: SelectOption[];
};

type Expense = {
  id: string;
  category_id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  bank_account_id: string;
  spent_on: string;
  department_id: string | null;
  vendor_name: string | null;
  receipt_file_id: string | null;
};

export function ExpenseForm({ expense, options, today }: { expense?: Expense; options: LedgerOptions; today: string }) {
  const [result, formAction] = useActionState(saveExpenseAction.bind(null, expense?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Date" name="spentOn" type="date" max={today} defaultValue={expense?.spent_on ?? today} required error={errors?.spentOn} />
        <TextField label="Amount" name="amount" inputMode="decimal" defaultValue={text(expense?.amount)} required error={errors?.amount} />
        <SelectField label="Category" name="categoryId" options={options.categories} placeholder="Choose a category" defaultValue={expense?.category_id} required error={errors?.categoryId} />
        <SelectField label="Department" name="departmentId" options={options.departments ?? []} placeholder="Not for one department" defaultValue={expense?.department_id ?? ''} error={errors?.departmentId} />
        <TextField label="Paid to" name="vendorName" defaultValue={text(expense?.vendor_name)} placeholder="Vendor or person" error={errors?.vendorName} />
        <SelectField label="Paid from" name="bankAccountId" options={options.accounts} defaultValue={expense?.bank_account_id ?? options.defaultAccountId} required error={errors?.bankAccountId} />
        <SelectField label="Paid by" name="method" options={methodOptions} defaultValue={expense?.method ?? 'bank_transfer'} error={errors?.method} />
        <TextField label="Reference" name="reference" defaultValue={text(expense?.reference)} hint="Such as the UTR or cheque number." error={errors?.reference} />
        <SelectField
          label="Receipt"
          name="receiptFileId"
          options={options.files}
          placeholder="None"
          defaultValue={expense?.receipt_file_id ?? ''}
          hint="Upload it in Files first, then choose it here."
          error={errors?.receiptFileId}
        />
      </FormGrid>
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={text(expense?.notes)} error={errors?.notes} />
      <FormActions>
        <SubmitButton label="Save expense" pendingLabel="Saving…" />
        <ButtonLink href="/finance/ledger?view=expenses" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Income = {
  id: string;
  category_id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  bank_account_id: string;
  received_on: string;
  client_id: string | null;
  file_id: string | null;
};

export function IncomeForm({ income, options, today }: { income?: Income; options: LedgerOptions; today: string }) {
  const [result, formAction] = useActionState(saveIncomeAction.bind(null, income?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <p className={formStyles.hint}>For money that did not come against an invoice. Invoice payments are recorded on the invoice.</p>
      <FormGrid>
        <TextField label="Date" name="receivedOn" type="date" max={today} defaultValue={income?.received_on ?? today} required error={errors?.receivedOn} />
        <TextField label="Amount" name="amount" inputMode="decimal" defaultValue={text(income?.amount)} required error={errors?.amount} />
        <SelectField label="Category" name="categoryId" options={options.categories} placeholder="Choose a category" defaultValue={income?.category_id} required error={errors?.categoryId} />
        <SelectField label="Client" name="clientId" options={options.clients ?? []} placeholder="No client" defaultValue={income?.client_id ?? ''} error={errors?.clientId} />
        <SelectField label="Received into" name="bankAccountId" options={options.accounts} defaultValue={income?.bank_account_id ?? options.defaultAccountId} required error={errors?.bankAccountId} />
        <SelectField label="Received by" name="method" options={methodOptions} defaultValue={income?.method ?? 'bank_transfer'} error={errors?.method} />
        <TextField label="Reference" name="reference" defaultValue={text(income?.reference)} error={errors?.reference} />
        <SelectField label="Document" name="fileId" options={options.files} placeholder="None" defaultValue={income?.file_id ?? ''} hint="Upload it in Files first." error={errors?.fileId} />
      </FormGrid>
      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={text(income?.notes)} error={errors?.notes} />
      <FormActions>
        <SubmitButton label="Save income" pendingLabel="Saving…" />
        <ButtonLink href="/finance/ledger?view=income" variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function RemovalForm({ kind, id, backHref }: { kind: 'income' | 'expense'; id: string; backHref: string }) {
  const [result, formAction] = useActionState(removeLedgerEntryAction.bind(null, kind, id), idleResult);
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <TextAreaField label="Why is it being removed?" name="reason" rows={3} required hint="It stays in the records, marked as removed, with this reason." error={result.fieldErrors?.reason} />
      <FormActions>
        <SubmitButton label="Remove entry" pendingLabel="Removing…" variant="danger" />
        <ButtonLink href={backHref} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type Account = {
  id: string;
  name: string;
  account_type: string;
  bank_name: string | null;
  account_holder: string | null;
  account_last4: string | null;
  ifsc: string | null;
  opening_balance: number;
  opening_date: string;
  is_primary: boolean;
  is_active: boolean;
};

export function BankAccountForm({ account, today, encryptionReady }: { account?: Account; today: string; encryptionReady: boolean }) {
  const [result, formAction] = useActionState(saveBankAccountAction.bind(null, account?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Name" name="name" defaultValue={account?.name} placeholder="HDFC current account" required error={errors?.name} />
        <SelectField
          label="Type"
          name="accountType"
          options={bankAccountTypes.map((type) => ({ value: type, label: bankAccountTypeLabels[type]! }))}
          defaultValue={account?.account_type ?? 'current'}
          error={errors?.accountType}
        />
        <TextField label="Bank" name="bankName" defaultValue={text(account?.bank_name)} error={errors?.bankName} />
        <TextField label="Account holder" name="accountHolder" defaultValue={text(account?.account_holder)} error={errors?.accountHolder} />
        <TextField
          label="Account number"
          name="accountNumber"
          inputMode="numeric"
          autoComplete="off"
          placeholder={account?.account_last4 ? `XXXXXX${account.account_last4}` : ''}
          disabled={!encryptionReady}
          hint={!encryptionReady ? 'Encryption is not set up, so the number cannot be saved yet.' : account?.account_last4 ? 'Leave empty to keep the saved number.' : 'Stored encrypted; shown masked.'}
          error={errors?.accountNumber}
        />
        <TextField label="IFSC" name="ifsc" defaultValue={text(account?.ifsc)} error={errors?.ifsc} />
        <TextField label="Opening balance" name="openingBalance" inputMode="decimal" defaultValue={text(account?.opening_balance ?? 0)} error={errors?.openingBalance} />
        <TextField label="Balance as of" name="openingDate" type="date" defaultValue={account?.opening_date ?? today} hint="Money before this date is already in the opening balance." error={errors?.openingDate} />
      </FormGrid>
      <div className={styles.checks}>
        <label className={styles.choice}>
          <input type="checkbox" name="isPrimary" defaultChecked={account?.is_primary ?? false} /> Main account: invoice payments with no account named count here
        </label>
        {account && (
          <label className={styles.choice}>
            <input type="checkbox" name="isActive" defaultChecked={account.is_active} /> In use
          </label>
        )}
      </div>
      <FormActions>
        <SubmitButton label="Save account" pendingLabel="Saving…" />
        <ButtonLink href={account ? `/finance/banks/${account.id}` : '/finance/banks'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function StatementImportForm({ accountId }: { accountId: string }) {
  const [result, formAction] = useActionState(importStatementAction.bind(null, accountId), idleResult);
  return (
    <form action={formAction}>
      <FormMessage result={result} />
      <div className={styles.inline}>
        <div className={formStyles.field}>
          <label htmlFor="statement-file" className={formStyles.label}>
            Statement CSV
          </label>
          <input id="statement-file" name="file" type="file" accept=".csv,text/csv" required className={formStyles.control} />
          <p className={formStyles.hint}>A date column, and an amount or debit and credit columns. Lines already imported are skipped.</p>
        </div>
        <SubmitButton label="Import" pendingLabel="Importing…" variant="secondary" />
      </div>
    </form>
  );
}

export function FinanceCategoryForm({ category, kind }: { category?: { id: string; name: string; is_active: boolean; system_key: string | null }; kind: 'income' | 'expense' }) {
  const [result, formAction] = useActionState(saveFinanceCategoryAction.bind(null, category?.id ?? null), idleResult);
  const prefix = `category-${category?.id ?? `new-${kind}`}`;
  return (
    <KeepValuesForm action={formAction} key={!category && result.status === 'success' ? result.message : prefix}>
      <FormMessage result={result} />
      <input type="hidden" name="kind" value={kind} />
      <div className={styles.inline}>
        <TextField label="Name" name="name" id={`${prefix}-name`} defaultValue={category?.name} required error={result.fieldErrors?.name} />
        {category && !category.system_key && (
          <label className={styles.choice}>
            <input type="checkbox" name="isActive" defaultChecked={category.is_active} /> In use
          </label>
        )}
        {category?.system_key && <input type="hidden" name="isActive" value="on" />}
        <SubmitButton label={category ? 'Save' : 'Add'} pendingLabel="Saving…" variant="secondary" />
      </div>
      {category?.system_key && <p className={formStyles.hint}>Used automatically, so it stays in use.</p>}
    </KeepValuesForm>
  );
}

export function AccountSelect({ accounts, defaultAccountId }: { accounts: SelectOption[]; defaultAccountId: string }) {
  return <SelectField label="Paid from" name="accountId" options={accounts} defaultValue={defaultAccountId} hint="The expense is filed against this account." />;
}
