'use client';

import { useActionState, useState } from 'react';
import { DocumentItemsEditor, type ItemDraft } from '@/components/finance/DocumentItemsEditor';
import { ButtonLink } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { Panel } from '@/components/ui/Panel';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import { isInterStateSupply } from '@/lib/finance/documentTotals';
import { stateOptionsWith } from '@/lib/finance/indianStates';
import { paymentMethodLabels, paymentMethods } from '@/lib/validation/payrollSchema';
import { payVendorBillAction, savePurchaseOrderAction, saveVendorAction, saveVendorBillAction } from '@/server/actions/purchaseActions';
import styles from './PurchaseForms.module.css';

const text = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value));

type VendorValues = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  payment_terms_days: number;
  notes: string | null;
  is_active: boolean;
};

export function VendorForm({ vendor }: { vendor?: VendorValues }) {
  const [result, formAction] = useActionState(saveVendorAction.bind(null, vendor?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const [state, setState] = useState(vendor?.state ?? '');
  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Name" name="name" defaultValue={vendor?.name} required error={errors?.name} />
        <TextField label="Contact person" name="contactPerson" defaultValue={text(vendor?.contact_person)} error={errors?.contactPerson} />
        <TextField label="Email" name="email" type="email" defaultValue={text(vendor?.email)} error={errors?.email} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={text(vendor?.phone)} error={errors?.phone} />
        <TextField label="GSTIN" name="gstin" defaultValue={text(vendor?.gstin)} maxLength={15} placeholder="15 characters, if registered" error={errors?.gstin} />
        <SelectField
          label="State"
          name="state"
          options={stateOptionsWith(state)}
          placeholder="Not set"
          value={state}
          onChange={(event) => setState(event.target.value)}
          hint="Decides CGST and SGST or IGST on purchase orders."
          error={errors?.state}
        />
        <TextField label="Pays within (days)" name="paymentTermsDays" type="number" min={0} max={365} defaultValue={text(vendor?.payment_terms_days ?? 30)} hint="Used for bill due dates." error={errors?.paymentTermsDays} />
      </FormGrid>
      <div className={layout.spaced}>
        <TextAreaField label="Address" name="address" rows={2} defaultValue={text(vendor?.address)} error={errors?.address} />
      </div>
      <div className={layout.spaced}>
        <TextAreaField label="Notes" name="notes" rows={2} defaultValue={text(vendor?.notes)} error={errors?.notes} />
      </div>
      {vendor && (
        <label className={styles.choice}>
          <input type="checkbox" name="isActive" defaultChecked={vendor.is_active} /> In use
        </label>
      )}
      <FormActions>
        <SubmitButton label="Save vendor" pendingLabel="Saving…" />
        <ButtonLink href={vendor ? `/finance/purchases/vendors/${vendor.id}` : '/finance/purchases?view=vendors'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export type VendorChoice = SelectOption & { state: string | null; paymentTermsDays: number };

type OrderValues = {
  id: string;
  vendor_id: string;
  title: string;
  order_date: string;
  expected_date: string | null;
  place_of_supply: string | null;
  delivery_address: string | null;
  notes: string | null;
  terms: string | null;
};

type PurchaseOrderFormProps = {
  order?: OrderValues;
  items?: ItemDraft[];
  vendors: VendorChoice[];
  defaultVendorId?: string;
  companyState: string | null;
  defaultTaxRate: number;
  today: string;
};

export function PurchaseOrderForm({ order, items = [], vendors, defaultVendorId, companyState, defaultTaxRate, today }: PurchaseOrderFormProps) {
  const [result, formAction] = useActionState(savePurchaseOrderAction.bind(null, order?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const [vendorId, setVendorId] = useState(order?.vendor_id ?? defaultVendorId ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(order?.place_of_supply ?? '');
  const vendor = vendors.find((option) => option.value === vendorId);
  const effectivePlace = placeOfSupply || vendor?.state || '';

  return (
    <KeepValuesForm action={formAction}>
      <div className={layout.stack}>
        <FormMessage result={result} />
        <Panel title="Details">
          <FormGrid>
            <SelectField label="Vendor" name="vendorId" options={vendors} placeholder="Choose a vendor" value={vendorId} onChange={(event) => setVendorId(event.target.value)} required error={errors?.vendorId} />
            <TextField label="What it is for" name="title" defaultValue={order?.title} required placeholder="For example: printer paper for Q4" error={errors?.title} />
            <TextField label="Order date" name="orderDate" type="date" defaultValue={order?.order_date ?? today} required error={errors?.orderDate} />
            <TextField label="Expected by" name="expectedDate" type="date" defaultValue={text(order?.expected_date)} error={errors?.expectedDate} />
            <SelectField
              label="Place of supply"
              name="placeOfSupply"
              options={stateOptionsWith(placeOfSupply)}
              placeholder={vendor?.state ? `Vendor's state (${vendor.state})` : 'Not set'}
              value={placeOfSupply}
              onChange={(event) => setPlaceOfSupply(event.target.value)}
              hint={companyState ? `Within ${companyState} is CGST and SGST. Anywhere else is IGST.` : 'Set your company state in Finance settings.'}
              error={errors?.placeOfSupply}
            />
          </FormGrid>
          <div className={layout.spaced}>
            <TextAreaField label="Deliver to" name="deliveryAddress" rows={2} defaultValue={text(order?.delivery_address)} error={errors?.deliveryAddress} />
          </div>
        </Panel>
        <Panel title="Items">
          <DocumentItemsEditor initialItems={items} defaultTaxRate={defaultTaxRate} isInterState={isInterStateSupply(companyState, effectivePlace)} error={errors?.items} />
        </Panel>
        <Panel title="Notes and terms" description="Both are printed on the order the vendor sees.">
          <TextAreaField label="Notes" name="notes" rows={2} defaultValue={text(order?.notes)} error={errors?.notes} />
          <div className={layout.spaced}>
            <TextAreaField label="Terms" name="terms" rows={3} defaultValue={text(order?.terms)} error={errors?.terms} />
          </div>
        </Panel>
      </div>
      <FormActions>
        <SubmitButton label={order ? 'Save changes' : 'Save order as draft'} pendingLabel="Saving…" />
        <ButtonLink href={order ? `/finance/purchases/orders/${order.id}` : '/finance/purchases?view=orders'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

type BillValues = {
  id: string;
  vendor_id: string;
  purchase_order_id: string | null;
  bill_number: string;
  bill_date: string;
  due_date: string;
  amount: number;
  tax_amount: number;
  category_id: string;
  department_id: string | null;
  file_id: string | null;
  description: string | null;
  amount_paid: number;
};

type BillOptions = {
  vendors: VendorChoice[];
  categories: SelectOption[];
  departments: SelectOption[];
  files: SelectOption[];
  orders: (SelectOption & { vendorId: string })[];
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function VendorBillForm({ bill, options, defaultVendorId, defaultOrderId, today }: { bill?: BillValues; options: BillOptions; defaultVendorId?: string; defaultOrderId?: string; today: string }) {
  const [result, formAction] = useActionState(saveVendorBillAction.bind(null, bill?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const [vendorId, setVendorId] = useState(bill?.vendor_id ?? defaultVendorId ?? '');
  const [billDate, setBillDate] = useState(bill?.bill_date ?? today);
  const vendor = options.vendors.find((option) => option.value === vendorId);
  const orders = options.orders.filter((order) => order.vendorId === vendorId);
  const vendorLocked = Boolean(bill && bill.amount_paid > 0);

  return (
    <KeepValuesForm action={formAction}>
      <FormMessage result={result} />
      <FormGrid>
        {vendorLocked ? (
          <>
            <input type="hidden" name="vendorId" value={vendorId} />
            <TextField label="Vendor" name="vendorName" defaultValue={vendor?.label} disabled hint="A bill with payments stays with its vendor." />
          </>
        ) : (
          <SelectField label="Vendor" name="vendorId" options={options.vendors} placeholder="Choose a vendor" value={vendorId} onChange={(event) => setVendorId(event.target.value)} required error={errors?.vendorId} />
        )}
        <SelectField
          key={vendorId}
          label="Purchase order"
          name="purchaseOrderId"
          options={orders}
          placeholder={orders.length ? 'None' : 'No issued orders for this vendor'}
          defaultValue={bill?.vendor_id === vendorId ? (bill?.purchase_order_id ?? '') : (defaultOrderId ?? '')}
          error={errors?.purchaseOrderId}
        />
        <TextField label="Vendor's bill number" name="billNumber" defaultValue={bill?.bill_number} required error={errors?.billNumber} />
        <TextField label="Bill date" name="billDate" type="date" max={today} value={billDate} onChange={(event) => setBillDate(event.target.value)} required error={errors?.billDate} />
        <TextField
          key={`${vendorId}-${billDate}`}
          label="Due date"
          name="dueDate"
          type="date"
          min={billDate}
          defaultValue={bill?.due_date ?? (billDate ? addDays(billDate, vendor?.paymentTermsDays ?? 30) : '')}
          required
          hint={vendor ? `${vendor.paymentTermsDays} days after the bill date by default.` : undefined}
          error={errors?.dueDate}
        />
        <TextField label="Total, with GST (₹)" name="amount" inputMode="decimal" defaultValue={text(bill?.amount)} required error={errors?.amount} />
        <TextField label="GST in it (₹)" name="taxAmount" inputMode="decimal" defaultValue={text(bill?.tax_amount ?? 0)} hint="For your records; 0 if none." error={errors?.taxAmount} />
        <SelectField label="Expense category" name="categoryId" options={options.categories} placeholder="Choose a category" defaultValue={bill?.category_id} required hint="Payments are filed under it." error={errors?.categoryId} />
        <SelectField label="Department" name="departmentId" options={options.departments} placeholder="Not for one department" defaultValue={bill?.department_id ?? ''} error={errors?.departmentId} />
        <SelectField label="Bill file" name="fileId" options={options.files} placeholder="None" defaultValue={bill?.file_id ?? ''} hint="Upload it in Files first, then choose it here." error={errors?.fileId} />
      </FormGrid>
      <div className={layout.spaced}>
        <TextAreaField label="Description" name="description" rows={2} defaultValue={text(bill?.description)} error={errors?.description} />
      </div>
      <FormActions>
        <SubmitButton label="Save bill" pendingLabel="Saving…" />
        <ButtonLink href={bill ? `/finance/purchases/bills/${bill.id}` : '/finance/purchases'} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}

export function BillPaymentForm({ billId, stillDue, accounts, defaultAccountId, today }: { billId: string; stillDue: number; accounts: SelectOption[]; defaultAccountId: string; today: string }) {
  // Counts recorded payments, so the form starts again from the new balance.
  const [saved, setSaved] = useState(0);
  const [result, formAction] = useActionState(async (previous: Parameters<typeof payVendorBillAction>[1], formData: FormData) => {
    const outcome = await payVendorBillAction(billId, previous, formData);
    if (outcome.status === 'success') setSaved((count) => count + 1);
    return outcome;
  }, idleResult);
  const errors = result.fieldErrors;
  return (
    <KeepValuesForm action={formAction} key={saved}>
      <FormMessage result={result} />
      <FormGrid>
        <TextField label="Amount (₹)" name="amount" inputMode="decimal" defaultValue={String(stillDue)} required hint="Pay part now and the rest later if you need to." error={errors?.amount} />
        <TextField label="Paid on" name="paidOn" type="date" max={today} defaultValue={today} required error={errors?.paidOn} />
        <SelectField label="Paid by" name="method" options={paymentMethods.map((method) => ({ value: method, label: paymentMethodLabels[method]! }))} defaultValue="bank_transfer" error={errors?.method} />
        <SelectField label="Paid from" name="accountId" options={accounts} defaultValue={defaultAccountId} required error={errors?.accountId} />
        <TextField label="Reference" name="reference" hint="Such as the UTR or cheque number." error={errors?.reference} />
      </FormGrid>
      <FormActions>
        <SubmitButton label="Record payment" pendingLabel="Saving…" />
      </FormActions>
    </KeepValuesForm>
  );
}
