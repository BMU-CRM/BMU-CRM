// Stage 8 of HR and Finance: payment follow-ups on unpaid invoices, receipt numbers for
// payments, and the morning reminders.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const inDays = (days: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe('payment follow-ups and receipts', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let invoiceId = '';
  let clientId = '';

  async function issuedInvoice(title: string, amount: number, dueDate?: string) {
    const { data, error } = await as.founder!.rpc('save_invoice', {
      p_invoice: null as unknown as string,
      p_values: { client_id: clientId, title, ...(dueDate ? { issue_date: today, due_date: dueDate } : {}) },
      p_items: [{ description: title, hsn_sac: '998314', quantity: 1, unit_price: amount, tax_rate: 0 }],
    });
    expect(error).toBeNull();
    const issued = await as.founder!.from('invoices').update({ status: 'issued' }).eq('id', data as string).select('id');
    expect(issued.data).toHaveLength(1);
    return data as string;
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    const { data: client } = await admin.from('clients').insert({ company_name: `Follow-up client ${runId}` }).select('id').single();
    clientId = client!.id;
    invoiceId = await issuedInvoice('Retainer', 10000);
  });

  it('keeps the follow-up board with Finance', async () => {
    expect((await as.designer!.rpc('get_follow_up_board', {})).error?.message).toContain('permission');
    const note = await as.designer!.from('invoice_follow_ups').insert({ invoice_id: invoiceId, status: 'contacted', note: 'Called' });
    expect(note.error).not.toBeNull();

    const { data, error } = await as.finance!.rpc('get_follow_up_board', {});
    expect(error).toBeNull();
    const row = data!.find((item) => item.invoice_id === invoiceId);
    expect(row).toMatchObject({ status: 'not_contacted', follow_up_count: 0, balance: 10000 });
  });

  it('records follow-ups as a history, with the latest one as the status', async () => {
    const noDate = await as.finance!.from('invoice_follow_ups').insert({ invoice_id: invoiceId, status: 'promise_to_pay', note: 'Will pay soon' });
    expect(noDate.error?.message).toContain('promised');
    const manual = await as.finance!.from('invoice_follow_ups').insert({ invoice_id: invoiceId, status: 'payment_received', note: 'Paid' });
    expect(manual.error).not.toBeNull();
    const backwards = await as.finance!.from('invoice_follow_ups').insert({ invoice_id: invoiceId, status: 'pending', note: 'Wait', contacted_on: today, next_follow_up_on: inDays(-1) });
    expect(backwards.error?.message).toContain('after');

    const first = await as.finance!.from('invoice_follow_ups').insert({ invoice_id: invoiceId, status: 'contacted', note: 'Emailed the accounts team', contacted_on: inDays(-2) }).select('created_by').single();
    expect(first.data?.created_by).toBe(ids.finance!);
    const second = await as.finance!.from('invoice_follow_ups').insert({
      invoice_id: invoiceId, status: 'promise_to_pay', note: 'Promised by Friday', promised_on: inDays(3), next_follow_up_on: today,
    });
    expect(second.error).toBeNull();

    const { data } = await as.finance!.rpc('get_follow_up_board', { p_status: 'promise_to_pay' });
    expect(data!.find((item) => item.invoice_id === invoiceId)).toMatchObject({ follow_up_count: 2, last_note: 'Promised by Friday', promised_on: inDays(3) });
    expect((await as.finance!.rpc('get_follow_up_board', { p_status: 'not_contacted' })).data!.some((item) => item.invoice_id === invoiceId)).toBe(false);
    // Follow-ups cannot be rewritten afterwards.
    expect((await as.finance!.from('invoice_follow_ups').update({ note: 'x' }).eq('invoice_id', invoiceId).select('id')).data ?? []).toEqual([]);
  });

  it('numbers payment receipts in a series per financial year', async () => {
    expect((await admin.rpc('financial_year_label', { p_date: '2027-03-31' })).data).toBe('26-27');
    expect((await admin.rpc('financial_year_label', { p_date: '2027-04-01' })).data).toBe('27-28');

    const first = await as.finance!.from('payments').insert({ invoice_id: invoiceId, amount: 4000, method: 'bank_transfer', reference: 'UTR-A' }).select('receipt_number').single();
    const second = await as.finance!.from('payments').insert({ invoice_id: invoiceId, amount: 1000, method: 'upi', reference: 'UPI-B' }).select('receipt_number').single();
    expect(first.error).toBeNull();
    expect(first.data!.receipt_number).toMatch(/^RCPT\/\d{2}-\d{2}\/\d{4}$/);
    const number = (value: string) => Number(value.split('/')[2]);
    expect(number(second.data!.receipt_number!)).toBe(number(first.data!.receipt_number!) + 1);
  });

  it('shows payment received once the invoice is paid, and stops further follow-ups', async () => {
    await as.finance!.from('payments').insert({ invoice_id: invoiceId, amount: 5000, method: 'bank_transfer', reference: 'UTR-C' });
    const { data: open } = await as.finance!.rpc('get_follow_up_board', {});
    expect(open!.some((item) => item.invoice_id === invoiceId)).toBe(false);
    const { data: all } = await as.finance!.rpc('get_follow_up_board', { p_include_paid: true });
    expect(all!.find((item) => item.invoice_id === invoiceId)?.status).toBe('payment_received');

    const late = await as.finance!.from('invoice_follow_ups').insert({ invoice_id: invoiceId, status: 'contacted', note: 'Thanked them' });
    expect(late.error?.message).toContain('not fully paid');
  });

  it('reminds Finance of invoices due in three days and follow-ups due today', async () => {
    const soon = await issuedInvoice('Hosting', 2000, inDays(3));
    await as.finance!.from('invoice_follow_ups').insert({ invoice_id: soon, status: 'pending', note: 'Sent a reminder', next_follow_up_on: today });

    expect((await admin.rpc('send_follow_up_reminders')).error).toBeNull();
    // Running twice the same day does not repeat them.
    expect((await admin.rpc('send_follow_up_reminders')).error).toBeNull();

    const { data: notes } = await admin.from('notifications').select('kind, link').eq('recipient_id', ids.finance!).in('kind', ['invoice_due_soon', 'follow_up_due']);
    expect(notes!.filter((note) => note.kind === 'invoice_due_soon' && note.link === `/invoices/${soon}`)).toHaveLength(1);
    expect(notes!.filter((note) => note.kind === 'follow_up_due' && note.link === `/finance/follow-ups/${soon}`)).toHaveLength(1);
    expect((await admin.from('notifications').select('id').eq('recipient_id', ids.designer!).in('kind', ['invoice_due_soon', 'follow_up_due'])).data).toEqual([]);
  });
});
