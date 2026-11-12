// Stage 10 of HR and Finance: reimbursement claims (manager or HR approves, Finance
// pays, the expense is filed once), the approvals record, and claims paid in a leaver's
// full and final settlement.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

describe('reimbursements', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let category = '';
  let account = '';
  let claimId = '';

  async function claim(key: string, amount: number, description: string) {
    const { data, error } = await as[key]!.from('reimbursements').insert({ employee_id: ids[key]!, category_id: category, description, expense_date: today, amount }).select('id').single();
    expect(error).toBeNull();
    return data!.id;
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('manager', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'manager');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'founder');
    account = (await admin.from('bank_accounts').select('id').eq('account_type', 'cash').single()).data!.id;
    category = (await admin.from('finance_categories').select('id').eq('kind', 'expense').is('system_key', null).limit(1).single()).data!.id;
  });

  it('lets people claim only for themselves, with their own receipt', async () => {
    const forged = await as.designer!
      .from('reimbursements')
      .insert({ employee_id: ids.colleague!, category_id: category, description: 'Cab to client', expense_date: today, amount: 450, status: 'approved' })
      .select('id, employee_id, status')
      .single();
    expect(forged.error).toBeNull();
    expect(forged.data).toMatchObject({ employee_id: ids.designer!, status: 'submitted' });
    claimId = forged.data!.id;

    const future = new Date(`${today}T00:00:00Z`);
    future.setUTCDate(future.getUTCDate() + 2);
    expect((await as.designer!.from('reimbursements').insert({ employee_id: ids.designer!, category_id: category, description: 'Later', expense_date: future.toISOString().slice(0, 10), amount: 1 })).error?.message).toContain('future');

    const { data: file } = await as.colleague!.from('files').insert({ kind: 'link', name: 'Not mine', external_url: 'https://example.com/r' }).select('id').single();
    expect((await as.designer!.from('reimbursements').insert({ employee_id: ids.designer!, category_id: category, description: 'With receipt', expense_date: today, amount: 1, receipt_file_id: file!.id })).error?.message).toContain('receipt');
  });

  it('shows a claim to the person, their manager, HR and Finance only', async () => {
    for (const key of ['designer', 'manager', 'hr', 'finance', 'founder']) {
      expect((await as[key]!.from('reimbursements').select('id').eq('id', claimId)).data, key).toHaveLength(1);
    }
    expect((await as.colleague!.from('reimbursements').select('id').eq('id', claimId)).data).toEqual([]);

    const { data: notes } = await admin.from('notifications').select('recipient_id').eq('kind', 'reimbursement_submitted').eq('link', '/approvals?tab=reimbursements');
    const recipients = new Set(notes!.map((note) => note.recipient_id));
    expect(recipients.has(ids.manager!) && recipients.has(ids.hr!)).toBe(true);
    expect(recipients.has(ids.colleague!)).toBe(false);
  });

  it('is decided by the manager or HR, never by the claimant, and paid only when approved', async () => {
    expect((await as.designer!.from('reimbursements').update({ status: 'approved' }).eq('id', claimId)).error?.message).toContain('cannot be changed');
    expect((await as.designer!.rpc('decide_reimbursement', { p_claim: claimId, p_approve: true, p_note: '' })).error?.message).toContain('permission');
    expect((await as.colleague!.rpc('decide_reimbursement', { p_claim: claimId, p_approve: true, p_note: '' })).error?.message).toContain('permission');
    expect((await as.finance!.rpc('pay_reimbursement', { p_claim: claimId, p_paid_on: today, p_method: 'upi', p_reference: '', p_account: account })).error?.message).toContain('approved');
    expect((await as.manager!.rpc('decide_reimbursement', { p_claim: claimId, p_approve: false, p_note: '' })).error?.message).toContain('reason');

    expect((await as.manager!.rpc('decide_reimbursement', { p_claim: claimId, p_approve: true, p_note: 'Client visit' })).error).toBeNull();
    expect((await as.hr!.rpc('decide_reimbursement', { p_claim: claimId, p_approve: false, p_note: 'Late' })).error?.message).toContain('not waiting');
    expect((await as.manager!.rpc('pay_reimbursement', { p_claim: claimId, p_paid_on: today, p_method: 'upi', p_reference: '', p_account: account })).error?.message).toContain('permission');
  });

  it('files the paid claim as one expense under its category', async () => {
    expect((await as.finance!.rpc('pay_reimbursement', { p_claim: claimId, p_paid_on: today, p_method: 'upi', p_reference: 'UPI-77', p_account: account })).error).toBeNull();
    expect((await as.finance!.rpc('pay_reimbursement', { p_claim: claimId, p_paid_on: today, p_method: 'upi', p_reference: 'UPI-77', p_account: account })).error?.message).toContain('approved');

    const { data: expenses } = await admin.from('expense_records').select('amount, category_id, source, vendor_name').eq('source_id', claimId);
    expect(expenses).toEqual([{ amount: 450, category_id: category, source: 'reimbursement', vendor_name: expect.stringContaining('designer') }]);
    const { data: paid } = await as.designer!.from('reimbursements').select('status, paid_by').eq('id', claimId).single();
    expect(paid).toEqual({ status: 'paid', paid_by: ids.finance! });
  });

  it('keeps a record of each decision, for those who may see the claim', async () => {
    const { data, error } = await as.designer!.rpc('get_approval_history', { p_type: 'reimbursement', p_id: claimId });
    expect(error).toBeNull();
    expect(data!.map((row) => row.decision)).toEqual(['approved', 'paid']);
    expect(data![0]).toMatchObject({ comment: 'Client visit', decided_by_name: expect.stringContaining('manager') });
    expect((await as.colleague!.rpc('get_approval_history', { p_type: 'reimbursement', p_id: claimId })).error?.message).toContain('permission');
    // Never read directly: only through the function above.
    expect((await as.finance!.from('approval_history').select('id')).data ?? []).toEqual([]);
  });

  it('lets the claimant cancel only while it waits', async () => {
    const pending = await claim('designer', 99, 'Stationery');
    expect((await as.designer!.from('reimbursements').update({ status: 'cancelled', amount: 1 }).eq('id', pending)).error).not.toBeNull();
    expect((await as.designer!.from('reimbursements').update({ status: 'cancelled' }).eq('id', pending).select('status')).data).toEqual([{ status: 'cancelled' }]);
    expect((await as.designer!.from('reimbursements').update({ status: 'cancelled' }).eq('id', claimId)).error).not.toBeNull();
  });

  it('pays a leaver\'s approved claims in the settlement, not twice', async () => {
    const owed = await claim('colleague', 1200, 'Team lunch');
    expect((await as.hr!.rpc('decide_reimbursement', { p_claim: owed, p_approve: true, p_note: '' })).error).toBeNull();

    const { data: resignation } = await as.colleague!.from('resignations').insert({ employee_id: ids.colleague!, reason: 'Moving city' }).select('id').single();
    expect((await as.hr!.rpc('decide_resignation', { p_resignation: resignation!.id, p_approve: true, p_last_day: today, p_note: '' })).error).toBeNull();

    const { data: suggestion } = await as.hr!.rpc('get_settlement_suggestion', { p_resignation: resignation!.id });
    expect((suggestion as Record<string, number>).reimbursementsDue).toBe(1200);
    const updated = await as.hr!.from('final_settlements').update({ reimbursements_due: 1200 }).eq('resignation_id', resignation!.id).select('final_amount');
    expect(updated.data).toEqual([{ final_amount: 1200 }]);

    expect((await as.finance!.rpc('pay_reimbursement', { p_claim: owed, p_paid_on: today, p_method: 'cash', p_reference: '', p_account: account })).error?.message).toContain('settlement');
    expect((await as.finance!.rpc('mark_settlement_paid', { p_resignation: resignation!.id, p_paid_on: today, p_method: 'bank_transfer', p_reference: 'FNF-1', p_account: account })).error).toBeNull();

    const { data: settled } = await admin.from('reimbursements').select('status, settled_in_resignation_id').eq('id', owed).single();
    expect(settled).toEqual({ status: 'paid', settled_in_resignation_id: resignation!.id });
    // Filed once, inside the settlement expense.
    expect((await admin.from('expense_records').select('id').eq('source_id', owed)).data).toEqual([]);
    expect((await admin.from('expense_records').select('amount').eq('source', 'settlement').eq('source_id', resignation!.id)).data).toEqual([{ amount: 1200 }]);
  });

  it('records leave, payroll and resignation decisions too', async () => {
    const { data: resignations } = await admin.from('resignations').select('id').eq('employee_id', ids.colleague!);
    const { data } = await as.hr!.rpc('get_approval_history', { p_type: 'resignation', p_id: resignations![0]!.id });
    expect(data!.map((row) => row.decision)).toEqual(['approved']);
    expect(data![0]!.decided_by_name).toContain('hr');
  });
});
