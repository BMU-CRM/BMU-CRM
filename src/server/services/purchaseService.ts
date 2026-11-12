import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { CurrentAccess } from './accessService';
import { listFinanceCategories } from './ledgerService';
import { listMyRecentFiles } from './hrService';
import { listDepartments } from './organisationService';

export const purchasesPerPage = 25;

export async function listVendors({ search, showInactive, page }: { search?: string; showInactive?: boolean; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * purchasesPerPage;
  let query = database
    .from('vendors')
    .select('id, name, contact_person, email, phone, gstin, state, payment_terms_days, is_active', { count: 'exact' })
    .order('name')
    .range(from, from + purchasesPerPage - 1);
  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`name.ilike.%${term}%,contact_person.ilike.%${term}%,gstin.ilike.%${term}%`);
  if (!showInactive) query = query.eq('is_active', true);
  const { data, count, error } = await query;
  if (error) throw error;
  return { vendors: data, total: count ?? 0 };
}

export async function getVendor(vendorId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('vendors').select('*').eq('id', vendorId).maybeSingle();
  if (error) throw error;
  return data;
}

export type Vendor = NonNullable<Awaited<ReturnType<typeof getVendor>>>;

const orderFields = `
  id, po_number, title, order_date, expected_date, status, place_of_supply, is_inter_state,
  subtotal, cgst_total, sgst_total, igst_total, tax_total, total, delivery_address, notes, terms,
  issued_at, cancelled_at, cancel_reason, created_at, vendor_id,
  vendor:vendors(id, name, gstin, address, state),
  author:employees(full_name)
`;

export async function listPurchaseOrders({ search, status, vendorId, page }: { search?: string; status?: string; vendorId?: string; page: number }) {
  const database = await createDatabaseClient();
  const from = (page - 1) * purchasesPerPage;
  let query = database
    .from('purchase_orders')
    .select(orderFields, { count: 'exact' })
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + purchasesPerPage - 1);
  const term = search ? cleanSearchTerm(search) : '';
  if (term) query = query.or(`title.ilike.%${term}%,po_number.ilike.%${term}%`);
  if (status) query = query.eq('status', status as 'draft');
  if (vendorId) query = query.eq('vendor_id', vendorId);
  const { data, count, error } = await query;
  if (error) throw error;
  return { orders: data, total: count ?? 0 };
}

export async function getPurchaseOrder(orderId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('purchase_orders').select(orderFields).eq('id', orderId).maybeSingle();
  if (error) throw error;
  return data;
}

export type PurchaseOrder = NonNullable<Awaited<ReturnType<typeof getPurchaseOrder>>>;

export async function listPurchaseOrderItems(orderId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('purchase_order_items')
    .select('id, position, description, hsn_sac, quantity, unit_price, tax_rate, taxable_amount, tax_amount')
    .eq('purchase_order_id', orderId)
    .order('position');
  if (error) throw error;
  return data;
}

const billFields = `
  id, vendor_id, purchase_order_id, bill_number, bill_date, due_date, amount, tax_amount, amount_paid, description,
  category_id, department_id, file_id, created_at, deleted_at, delete_reason,
  vendor:vendors(id, name),
  order:purchase_orders(id, po_number, title),
  category:finance_categories(name),
  department:departments(name),
  file:files(id, name)
`;

export type BillFilters = {
  search?: string;
  vendorId?: string;
  status?: 'unpaid' | 'part_paid' | 'paid' | 'open' | 'overdue';
  removed?: boolean;
  page: number;
};

export async function listVendorBills(filters: BillFilters, today: string) {
  const database = await createDatabaseClient();
  const from = (filters.page - 1) * purchasesPerPage;
  // Paid against the bill total cannot be compared in a filter, so those statuses are
  // worked out here from every matching bill, then paged.
  const comparesPaid = filters.status === 'part_paid' || filters.status === 'paid' || filters.status === 'open' || filters.status === 'overdue';
  let query = database
    .from('vendor_bills')
    .select(billFields, { count: 'exact' })
    .order('due_date', { ascending: filters.status === 'open' || filters.status === 'overdue' })
    .order('created_at', { ascending: false });
  query = comparesPaid ? query.range(0, 4999) : query.range(from, from + purchasesPerPage - 1);
  query = filters.removed ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  const term = filters.search ? cleanSearchTerm(filters.search) : '';
  if (term) query = query.or(`bill_number.ilike.%${term}%,description.ilike.%${term}%`);
  if (filters.vendorId) query = query.eq('vendor_id', filters.vendorId);
  if (filters.status === 'unpaid') query = query.eq('amount_paid', 0);
  if (filters.status === 'overdue') query = query.lt('due_date', today);
  const { data, count, error } = await query;
  if (error) throw error;
  if (!comparesPaid) return { bills: data, total: count ?? 0 };

  const matching = data.filter((bill) =>
    filters.status === 'part_paid' ? bill.amount_paid > 0 && bill.amount_paid < bill.amount : filters.status === 'paid' ? bill.amount_paid >= bill.amount : bill.amount_paid < bill.amount,
  );
  return { bills: matching.slice(from, from + purchasesPerPage), total: matching.length };
}

export async function getVendorBill(billId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('vendor_bills').select(billFields).eq('id', billId).maybeSingle();
  if (error) throw error;
  return data;
}

export type VendorBill = NonNullable<Awaited<ReturnType<typeof getVendorBill>>>;

export async function listBillPayments(billId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('vendor_bill_payments')
    .select(
      `id, paid_on, amount, method, reference, created_at, deleted_at, delete_reason,
       account:bank_accounts(name), payer:employees!vendor_bill_payments_created_by_fkey(full_name)`,
    )
    .eq('bill_id', billId)
    .order('paid_on')
    .order('created_at');
  if (error) throw error;
  return data;
}

// What is still owed to vendors, overall and past due.
export async function getPayablesSummary(today: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('vendor_bills').select('amount, amount_paid, due_date').is('deleted_at', null);
  if (error) throw error;
  const open = data.filter((bill) => bill.amount_paid < bill.amount);
  const owed = (bills: typeof open) => bills.reduce((sum, bill) => sum + Number(bill.amount) - Number(bill.amount_paid), 0);
  return {
    openBills: open.length,
    owed: owed(open),
    overdue: owed(open.filter((bill) => bill.due_date < today)),
    dueThisWeek: owed(open.filter((bill) => bill.due_date >= today && bill.due_date <= addDays(today, 7))),
  };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Everything bought from one vendor.
export async function getVendorHistory(vendorId: string) {
  const database = await createDatabaseClient();
  const [orders, bills] = await Promise.all([
    database.from('purchase_orders').select('id, po_number, title, order_date, status, total').eq('vendor_id', vendorId).order('order_date', { ascending: false }).limit(100),
    database
      .from('vendor_bills')
      .select('id, bill_number, bill_date, due_date, amount, amount_paid')
      .eq('vendor_id', vendorId)
      .is('deleted_at', null)
      .order('bill_date', { ascending: false })
      .limit(100),
  ]);
  if (orders.error) throw orders.error;
  if (bills.error) throw bills.error;
  return { orders: orders.data, bills: bills.data };
}

export async function getVendorOptions(keepId?: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('vendors').select('id, name, state, payment_terms_days, is_active').order('name');
  if (error) throw error;
  return data
    .filter((vendor) => vendor.is_active || vendor.id === keepId)
    .map((vendor) => ({ value: vendor.id, label: vendor.name, state: vendor.state, paymentTermsDays: vendor.payment_terms_days }));
}

export type VendorChoice = Awaited<ReturnType<typeof getVendorOptions>>[number];

export async function getBillOptions(access: CurrentAccess, keep: { vendorId?: string; categoryId?: string } = {}) {
  const database = await createDatabaseClient();
  const [vendors, categories, departments, files, orders] = await Promise.all([
    getVendorOptions(keep.vendorId),
    listFinanceCategories('expense'),
    listDepartments(),
    listMyRecentFiles(access),
    database.from('purchase_orders').select('id, po_number, title, vendor_id').in('status', ['issued', 'received']).order('order_date', { ascending: false }).limit(200),
  ]);
  if (orders.error) throw orders.error;
  return {
    vendors,
    categories: categories
      .filter((category) => !category.system_key && (category.is_active || category.id === keep.categoryId))
      .map((category) => ({ value: category.id, label: category.name })),
    departments: departments.map((department) => ({ value: department.id, label: department.name })),
    files: files.map((file) => ({ value: file.id, label: file.name })),
    orders: orders.data.map((order) => ({ value: order.id, label: `${order.po_number} · ${order.title}`, vendorId: order.vendor_id })),
  };
}
