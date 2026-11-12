// Stage 9 of HR and Finance: vendors, purchase orders and vendor bills, with payments
// that file the expense once.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

describe('purchases and vendor bills', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let outOfState = '';
  let inState = '';
  let category = '';
  let account = '';
  let orderId = '';
  let billId = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    await admin.from('finance_settings').update({ state: 'Tamil Nadu' }).eq('id', true);
    account = (await admin.from('bank_accounts').select('id').eq('account_type', 'cash').single()).data!.id;
    category = (await admin.from('finance_categories').select('id').eq('kind', 'expense').is('system_key', null).limit(1).single()).data!.id;
  });

  it('keeps vendors and purchases with Finance', async () => {
    for (const key of ['hr', 'designer']) {
      expect((await as[key]!.from('vendors').insert({ name: `Nope ${runId}` })).error, key).not.toBeNull();
      expect((await as[key]!.rpc('save_purchase_order', { p_order: null as unknown as string, p_values: {}, p_items: [] })).error?.message, key).toContain('permission');
    }
    const first = await as.finance!.from('vendors').insert({ name: `Paper Co ${runId}`, state: 'Karnataka', gstin: '29ABCDE1234F1Z5' }).select('id, created_by').single();
    expect(first.error).toBeNull();
    expect(first.data!.created_by).toBe(ids.finance!);
    outOfState = first.data!.id;
    inState = (await as.finance!.from('vendors').insert({ name: `Chennai Prints ${runId}`, state: 'Tamil Nadu' }).select('id').single()).data!.id;
    expect((await as.finance!.from('vendors').insert({ name: `paper co ${runId}` })).error).not.toBeNull();
    expect((await as.hr!.from('vendors').select('id')).data).toEqual([]);
  });

  it('works out purchase order totals and the GST split like invoices', async () => {
    const { data, error } = await as.finance!.rpc('save_purchase_order', {
      p_order: null as unknown as string,
      p_values: { vendor_id: outOfState, title: 'Printer paper' },
      p_items: [{ description: 'A4 reams', hsn_sac: '4802', quantity: 2, unit_price: 1000, tax_rate: 18 }],
    });
    expect(error).toBeNull();
    orderId = data as string;
    const { data: order } = await admin.from('purchase_orders').select('status, po_number, subtotal, tax_total, igst_total, cgst_total, total, place_of_supply').eq('id', orderId).single();
    expect(order).toEqual({ status: 'draft', po_number: null, subtotal: 2000, tax_total: 360, igst_total: 360, cgst_total: 0, total: 2360, place_of_supply: 'Karnataka' });

    const local = await as.finance!.rpc('save_purchase_order', {
      p_order: null as unknown as string,
      p_values: { vendor_id: inState, title: 'Brochures' },
      p_items: [{ description: 'Brochure print', quantity: 100, unit_price: 10, tax_rate: 12 }],
    });
    const { data: localOrder } = await admin.from('purchase_orders').select('cgst_total, sgst_total, igst_total').eq('id', local.data as string).single();
    expect(localOrder).toEqual({ cgst_total: 60, sgst_total: 60, igst_total: 0 });

    // Totals cannot be typed in directly.
    await as.finance!.from('purchase_orders').update({ subtotal: 1 }).eq('id', orderId);
    expect((await admin.from('purchase_orders').select('subtotal').eq('id', orderId).single()).data?.subtotal).toBe(2000);
  });

  it('numbers an order when it is issued, and then keeps it as it was', async () => {
    const issued = await as.finance!.from('purchase_orders').update({ status: 'issued' }).eq('id', orderId).select('po_number').single();
    expect(issued.error).toBeNull();
    expect(issued.data!.po_number).toMatch(/^PO\/\d{2}-\d{2}\/\d{4}$/);

    expect((await as.finance!.from('purchase_orders').update({ title: 'Changed' }).eq('id', orderId)).error?.message).toContain('cannot be changed');
    const resave = await as.finance!.rpc('save_purchase_order', { p_order: orderId, p_values: { vendor_id: outOfState, title: 'x' }, p_items: [{ description: 'x', quantity: 1, unit_price: 1, tax_rate: 0 }] });
    expect(resave.error?.message).toContain('draft');
    expect((await as.finance!.from('purchase_orders').update({ status: 'cancelled' }).eq('id', orderId)).error?.message).toContain('reason');
    expect((await as.finance!.from('purchase_orders').update({ status: 'received' }).eq('id', orderId).select('status')).data).toEqual([{ status: 'received' }]);
  });

  it('records bills once per vendor and bill number', async () => {
    const bill = await as.finance!
      .from('vendor_bills')
      .insert({ vendor_id: outOfState, purchase_order_id: orderId, bill_number: `INV-${runId}`, bill_date: today, due_date: today, amount: 10000, tax_amount: 1525.42, category_id: category, amount_paid: 9999 })
      .select('id, amount_paid')
      .single();
    expect(bill.error).toBeNull();
    expect(bill.data!.amount_paid).toBe(0);
    billId = bill.data!.id;

    const again = await as.finance!.from('vendor_bills').insert({ vendor_id: outOfState, bill_number: `inv-${runId}`, bill_date: today, due_date: today, amount: 5, category_id: category });
    expect(again.error).not.toBeNull();
    const income = (await admin.from('finance_categories').select('id').eq('kind', 'income').limit(1).single()).data!.id;
    expect((await as.finance!.from('vendor_bills').insert({ vendor_id: inState, bill_number: 'X1', bill_date: today, due_date: today, amount: 5, category_id: income })).error?.message).toContain('expense category');
  });

  it('pays bills in parts, filing each payment as one expense', async () => {
    const first = await as.finance!.rpc('pay_vendor_bill', { p_bill: billId, p_amount: 4000, p_paid_on: today, p_method: 'bank_transfer', p_reference: 'NEFT-1', p_account: account });
    expect(first.error).toBeNull();
    expect((await as.finance!.rpc('pay_vendor_bill', { p_bill: billId, p_amount: 7000, p_paid_on: today, p_method: 'bank_transfer', p_reference: '', p_account: account })).error?.message).toContain('more than');
    expect((await as.hr!.rpc('pay_vendor_bill', { p_bill: billId, p_amount: 1, p_paid_on: today, p_method: 'cash', p_reference: '', p_account: account })).error?.message).toContain('permission');

    const { data: partly } = await admin.from('vendor_bills').select('amount, amount_paid').eq('id', billId).single();
    expect(partly!.amount_paid).toBe(4000);
    expect((await admin.rpc('vendor_bill_status', { p_amount: partly!.amount, p_paid: partly!.amount_paid })).data).toBe('part_paid');

    const second = await as.finance!.rpc('pay_vendor_bill', { p_bill: billId, p_amount: 6000, p_paid_on: today, p_method: 'upi', p_reference: 'UPI-2', p_account: account });
    expect(second.error).toBeNull();
    const { data: expenses } = await admin.from('expense_records').select('amount, source, category_id, vendor_name').in('source_id', [first.data as string, second.data as string]);
    expect(expenses!.map((row) => row.amount).sort()).toEqual([4000, 6000]);
    expect(expenses!.every((row) => row.source === 'vendor_bill' && row.category_id === category && row.vendor_name === `Paper Co ${runId}`)).toBe(true);

    // The paid amount moves only with payments.
    expect((await as.finance!.from('vendor_bills').update({ amount_paid: 0 }).eq('id', billId)).error).not.toBeNull();
    expect((await as.finance!.from('vendor_bills').update({ amount: 5000 }).eq('id', billId)).error?.message).toContain('less than');
  });

  it('removes a payment with its expense, and only unpaid bills', async () => {
    const { data: payments } = await admin.from('vendor_bill_payments').select('id, amount').eq('bill_id', billId);
    const small = payments!.find((row) => row.amount === 4000)!;
    expect((await as.finance!.rpc('remove_vendor_bill', { p_bill: billId, p_reason: 'Wrong bill' })).error?.message).toContain('unpaid');
    expect((await as.finance!.rpc('remove_vendor_bill_payment', { p_payment: small.id, p_reason: '' })).error?.message).toContain('reason');
    expect((await as.finance!.rpc('remove_vendor_bill_payment', { p_payment: small.id, p_reason: 'Paid twice by mistake' })).error).toBeNull();

    expect((await admin.from('vendor_bills').select('amount_paid').eq('id', billId).single()).data?.amount_paid).toBe(6000);
    const { data: expense } = await admin.from('expense_records').select('deleted_at').eq('source', 'vendor_bill').eq('source_id', small.id).single();
    expect(expense!.deleted_at).not.toBeNull();

    const unpaid = await as.finance!.from('vendor_bills').insert({ vendor_id: inState, bill_number: `B-${runId}`, bill_date: today, due_date: today, amount: 300, category_id: category }).select('id').single();
    expect((await as.finance!.rpc('remove_vendor_bill', { p_bill: unpaid.data!.id, p_reason: 'Entered by mistake' })).error).toBeNull();
    // A removed bill's number can be used again.
    expect((await as.finance!.from('vendor_bills').insert({ vendor_id: inState, bill_number: `B-${runId}`, bill_date: today, due_date: today, amount: 300, category_id: category })).error).toBeNull();
  });

  it('reminds whoever manages purchases of bills due in three days', async () => {
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 3);
    const { data } = await as.finance!.from('vendor_bills').insert({ vendor_id: inState, bill_number: `D-${runId}`, bill_date: today, due_date: due.toISOString().slice(0, 10), amount: 750, category_id: category }).select('id').single();
    expect((await admin.rpc('send_vendor_bill_reminders')).error).toBeNull();
    expect((await admin.rpc('send_vendor_bill_reminders')).error).toBeNull();
    const { data: notes } = await admin.from('notifications').select('id').eq('recipient_id', ids.finance!).eq('link', `/finance/purchases/bills/${data!.id}`);
    expect(notes).toHaveLength(1);
  });
});
