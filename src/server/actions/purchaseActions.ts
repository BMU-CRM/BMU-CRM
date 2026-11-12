'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databaseFailure, failure, isStillInUse, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { itemsForDatabase, parseLineItems } from '@/lib/validation/financeSchema';
import { billPaymentSchema, purchaseOrderSchema, reasonSchema, vendorBillSchema, vendorSchema } from '@/lib/validation/purchaseSchema';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';
const text = (formData: FormData, name: string) => formData.get(name) ?? '';

function refreshPurchases() {
  revalidatePath('/finance/purchases', 'layout');
}

export async function saveVendorAction(vendorId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = vendorSchema.safeParse({
    name: text(formData, 'name'),
    contactPerson: text(formData, 'contactPerson'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    gstin: text(formData, 'gstin'),
    address: text(formData, 'address'),
    state: text(formData, 'state'),
    paymentTermsDays: text(formData, 'paymentTermsDays') || '30',
    notes: text(formData, 'notes'),
    isActive: vendorId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    name: values.name,
    contact_person: values.contactPerson,
    email: values.email,
    phone: values.phone,
    gstin: values.gstin,
    address: values.address,
    state: values.state,
    payment_terms_days: values.paymentTermsDays,
    notes: values.notes,
    is_active: values.isActive,
  };
  const database = await createDatabaseClient();
  const { data, error } = vendorId
    ? await database.from('vendors').update(row).eq('id', vendorId).select('id')
    : await database.from('vendors').insert(row).select('id');
  if (error) return databaseFailure(error, 'A vendor with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  refreshPurchases();
  redirect(`/finance/purchases/vendors/${data[0]!.id}`);
}

export async function deleteVendorAction(vendorId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('vendors').delete().eq('id', vendorId).select('id');
  if (error) {
    if (isStillInUse(error)) return failure('This vendor has orders or bills, so it cannot be deleted. Mark it as not in use instead.');
    return databaseFailure(error);
  }
  if (data.length === 0) return failure(noPermission);
  refreshPurchases();
  redirect('/finance/purchases?view=vendors');
}

export async function savePurchaseOrderAction(orderId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = purchaseOrderSchema.safeParse({
    vendorId: text(formData, 'vendorId'),
    title: text(formData, 'title'),
    orderDate: text(formData, 'orderDate'),
    expectedDate: text(formData, 'expectedDate'),
    placeOfSupply: text(formData, 'placeOfSupply'),
    deliveryAddress: text(formData, 'deliveryAddress'),
    notes: text(formData, 'notes'),
    terms: text(formData, 'terms'),
  });
  if (!parsed.success) return validationFailure(parsed.error);
  const lines = parseLineItems(formData);
  if (!lines.ok) return { status: 'error', message: lines.message, fieldErrors: { items: lines.message } };

  const values = parsed.data;
  // The database works out every amount from the items.
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('save_purchase_order', {
    p_order: orderId as string,
    p_values: {
      vendor_id: values.vendorId,
      title: values.title,
      order_date: values.orderDate,
      expected_date: values.expectedDate,
      place_of_supply: values.placeOfSupply,
      delivery_address: values.deliveryAddress,
      notes: values.notes,
      terms: values.terms,
    },
    p_items: itemsForDatabase(lines.items),
  });
  if (error) return databaseFailure(error);

  refreshPurchases();
  redirect(`/finance/purchases/orders/${data}`);
}

async function moveOrder(orderId: string, change: { status: 'issued' | 'received' | 'cancelled'; cancel_reason?: string }) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('purchase_orders').update(change).eq('id', orderId).select('po_number');
  if (error) return { error: databaseFailure(error) };
  if (data.length === 0) return { error: failure(noPermission) };
  refreshPurchases();
  return { number: data[0]!.po_number };
}

export async function issuePurchaseOrderAction(orderId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const result = await moveOrder(orderId, { status: 'issued' });
  return result.error ?? success(`Issued as ${result.number}. It can no longer be changed.`);
}

export async function markOrderReceivedAction(orderId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const result = await moveOrder(orderId, { status: 'received' });
  return result.error ?? success('Marked as received.');
}

export async function cancelPurchaseOrderAction(orderId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = reasonSchema.safeParse({ reason: formData.get('reason') });
  if (!parsed.success) return validationFailure(parsed.error);
  const result = await moveOrder(orderId, { status: 'cancelled', cancel_reason: parsed.data.reason });
  if (result.error) return result.error;
  redirect(`/finance/purchases/orders/${orderId}`);
}

export async function deleteDraftOrderAction(orderId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.from('purchase_orders').delete().eq('id', orderId).eq('status', 'draft').select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('Only a draft order can be deleted. Cancel an issued one instead.');
  refreshPurchases();
  redirect('/finance/purchases?view=orders');
}

export async function saveVendorBillAction(billId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = vendorBillSchema.safeParse({
    vendorId: text(formData, 'vendorId'),
    purchaseOrderId: text(formData, 'purchaseOrderId'),
    billNumber: text(formData, 'billNumber'),
    billDate: text(formData, 'billDate'),
    dueDate: text(formData, 'dueDate'),
    amount: text(formData, 'amount'),
    taxAmount: text(formData, 'taxAmount'),
    categoryId: text(formData, 'categoryId'),
    departmentId: text(formData, 'departmentId'),
    fileId: text(formData, 'fileId'),
    description: text(formData, 'description'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const row = {
    vendor_id: values.vendorId,
    purchase_order_id: values.purchaseOrderId,
    bill_number: values.billNumber,
    bill_date: values.billDate,
    due_date: values.dueDate,
    amount: values.amount,
    tax_amount: values.taxAmount,
    category_id: values.categoryId,
    department_id: values.departmentId,
    file_id: values.fileId,
    description: values.description,
  };
  const database = await createDatabaseClient();
  const { data, error } = billId
    ? await database.from('vendor_bills').update(row).eq('id', billId).select('id')
    : await database.from('vendor_bills').insert(row).select('id');
  if (error) return databaseFailure(error, 'This vendor already has a bill with this number.');
  if (data.length === 0) return failure(noPermission);

  refreshPurchases();
  revalidatePath('/finance/ledger');
  redirect(`/finance/purchases/bills/${data[0]!.id}`);
}

export async function payVendorBillAction(billId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = billPaymentSchema.safeParse({
    amount: text(formData, 'amount'),
    paidOn: text(formData, 'paidOn'),
    method: text(formData, 'method'),
    reference: text(formData, 'reference'),
    accountId: text(formData, 'accountId'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const values = parsed.data;
  const database = await createDatabaseClient();
  const { error } = await database.rpc('pay_vendor_bill', {
    p_bill: billId,
    p_amount: values.amount,
    p_paid_on: values.paidOn,
    p_method: values.method,
    p_reference: values.reference ?? '',
    p_account: values.accountId,
  });
  if (error) return databaseFailure(error);

  refreshPurchases();
  revalidatePath('/finance', 'layout');
  return success('Payment recorded, and filed as an expense.');
}

export async function removeBillPaymentAction(billId: string, paymentId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = reasonSchema.safeParse({ reason: formData.get('reason') });
  if (!parsed.success) return validationFailure(parsed.error);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('remove_vendor_bill_payment', { p_payment: paymentId, p_reason: parsed.data.reason });
  if (error) return databaseFailure(error);
  revalidatePath('/finance', 'layout');
  redirect(`/finance/purchases/bills/${billId}`);
}

export async function removeVendorBillAction(billId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.purchasesManage))) return failure(noPermission);
  const parsed = reasonSchema.safeParse({ reason: formData.get('reason') });
  if (!parsed.success) return validationFailure(parsed.error);
  const database = await createDatabaseClient();
  const { error } = await database.rpc('remove_vendor_bill', { p_bill: billId, p_reason: parsed.data.reason });
  if (error) return databaseFailure(error);
  refreshPurchases();
  redirect('/finance/purchases?view=bills');
}
