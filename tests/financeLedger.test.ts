// Stage 7 of HR and Finance: the ledger. Who sees money, removal with a reason instead
// of deletion, automatic salary expenses filed once, every movement in one list without
// double counting, account balances, statement import and reconciliation.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseStatementCsv } from '@/lib/finance/parseStatementCsv';
import { createTestPeople } from './helpers/testDatabase';

describe('reading bank statements', () => {
  it('reads separate withdrawal and deposit columns under a few lines of account details', () => {
    const csv = [
      'Account statement,HDFC Bank',
      'Account number,XXXX4321',
      'Date,Narration,Chq./Ref.No.,Withdrawal Amt,Deposit Amt,Closing Balance',
      '05/11/2026,"NEFT-ACME, LTD",UTR123,,"4,000.00","1,04,000.00"',
      '06/11/26,RENT NOV,CHQ9,"25,000.00",,"79,000.00"',
      'Opening balance,,,,,',
    ].join('\n');
    const { rows, error, skipped } = parseStatementCsv(csv);
    expect(error).toBeNull();
    expect(skipped).toBe(1);
    expect(rows).toEqual([
      { date: '2026-11-05', description: 'NEFT-ACME, LTD', reference: 'UTR123', amount: 4000, balance: 104000 },
      { date: '2026-11-06', description: 'RENT NOV', reference: 'CHQ9', amount: -25000, balance: 79000 },
    ]);
  });

  it('reads one signed amount column, and Dr or Cr marks', () => {
    const { rows } = parseStatementCsv('date,description,reference,amount\n2026-11-07,Card fee,,-118\n2026-11-08,Refund,R1,250.50 Cr\n2026-11-09,Charge,,99 Dr');
    expect(rows.map((row) => row.amount)).toEqual([-118, 250.5, -99]);
    expect(rows[1]?.reference).toBe('R1');
  });

  it('explains a file without the needed columns', () => {
    expect(parseStatementCsv('name,value\nx,1').error).toContain('Could not find the columns');
  });
});

const runId = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

describe('the finance ledger', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let bank = '';
  let cash = '';
  let rent = '';
  let otherIncome = '';
  let invoiceId = '';

  async function balances() {
    const { data, error } = await as.finance!.rpc('get_account_balances');
    expect(error).toBeNull();
    return new Map((data ?? []).map((row) => [row.bank_account_id, Number(row.balance)]));
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');

    cash = (await admin.from('bank_accounts').select('id').eq('account_type', 'cash').single()).data!.id;
    const { data, error } = await as.finance!
      .from('bank_accounts')
      .insert({ name: `HDFC current ${runId}`, account_type: 'current', bank_name: 'HDFC Bank', opening_balance: 100000, opening_date: '2026-01-01', is_primary: true, account_number_encrypted: 'v1:abc', account_last4: '4321' })
      .select('id')
      .single();
    expect(error).toBeNull();
    bank = data!.id;
    rent = (await admin.from('finance_categories').select('id').eq('name', 'Rent').single()).data!.id;
    otherIncome = (await admin.from('finance_categories').select('id').eq('name', 'Other income').single()).data!.id;

    // An issued invoice with a payment that names no account, so it counts in the primary one.
    const { data: client } = await admin.from('clients').insert({ company_name: `Ledger client ${runId}` }).select('id').single();
    const { data: saved, error: saveError } = await as.founder!.rpc('save_invoice', {
      p_invoice: null as unknown as string,
      p_values: { client_id: client!.id, title: 'Website' },
      p_items: [{ description: 'Design', hsn_sac: '998314', quantity: 1, unit_price: 10000, tax_rate: 0 }],
    });
    expect(saveError).toBeNull();
    invoiceId = saved as string;
    await as.founder!.from('invoices').update({ status: 'issued' }).eq('id', invoiceId);
    const paid = await as.finance!.from('payments').insert({ invoice_id: invoiceId, amount: 4000, method: 'bank_transfer', reference: 'UTR-1' });
    expect(paid.error).toBeNull();
  });

  it('keeps the ledger and accounts with Finance and the Founder', async () => {
    for (const key of ['hr', 'designer']) {
      expect((await as[key]!.from('bank_accounts').select('id')).data, key).toEqual([]);
      expect((await as[key]!.from('expense_records').insert({ category_id: rent, spent_on: today, amount: 1, method: 'cash', bank_account_id: cash })).error, key).not.toBeNull();
      expect((await as[key]!.rpc('get_money_movements', { p_from: '2026-01-01', p_to: '2026-12-31' })).error?.message, key).toContain('permission');
    }
    expect((await as.founder!.rpc('get_account_balances')).error).toBeNull();
    // Everyone can read categories, for reimbursement claims later.
    expect((await as.designer!.from('finance_categories').select('id').eq('id', rent)).data).toHaveLength(1);
  });

  it('records income and expenses against the right kind of category', async () => {
    const wrong = await as.finance!.from('expense_records').insert({ category_id: otherIncome, spent_on: today, amount: 500, method: 'cash', bank_account_id: cash });
    expect(wrong.error?.message).toContain('expense category');

    const rentPaid = await as.finance!
      .from('expense_records')
      .insert({ category_id: rent, spent_on: today, amount: 25000, method: 'bank_transfer', reference: 'RENT-NOV', bank_account_id: bank, vendor_name: 'Landlord' })
      .select('id, created_by, source')
      .single();
    expect(rentPaid.error).toBeNull();
    expect(rentPaid.data).toMatchObject({ created_by: ids.finance!, source: 'manual' });

    const duplicate = await as.finance!.from('expense_records').insert({ category_id: rent, spent_on: today, amount: 25000, method: 'bank_transfer', reference: 'rent-nov', bank_account_id: bank });
    expect(duplicate.error).not.toBeNull();

    const interest = await as.finance!.from('income_records').insert({ category_id: otherIncome, received_on: today, amount: 1500, method: 'bank_transfer', bank_account_id: bank });
    expect(interest.error).toBeNull();
  });

  it('never deletes money records, but removes them with a reason', async () => {
    const { data } = await as.finance!.from('expense_records').insert({ category_id: rent, spent_on: today, amount: 999, method: 'cash', bank_account_id: cash }).select('id').single();
    expect((await as.finance!.from('expense_records').delete().eq('id', data!.id).select('id')).data ?? []).toEqual([]);
    expect((await as.finance!.rpc('remove_ledger_entry', { p_kind: 'expense', p_id: data!.id, p_reason: '' })).error?.message).toContain('reason');
    expect((await as.finance!.rpc('remove_ledger_entry', { p_kind: 'expense', p_id: data!.id, p_reason: 'Entered twice' })).error).toBeNull();
    const { data: removed } = await admin.from('expense_records').select('deleted_by, delete_reason').eq('id', data!.id).single();
    expect(removed).toEqual({ deleted_by: ids.finance!, delete_reason: 'Entered twice' });
    expect((await as.finance!.from('expense_records').update({ amount: 1 }).eq('id', data!.id)).error?.message).toContain('removed');
  });

  it('files paid salaries as one expense, which cannot be changed by hand', async () => {
    await admin.from('employees').update({ joining_date: '2026-01-01' }).eq('id', ids.designer!);
    await admin.from('company_settings').update({ payroll_absence_lop: false }).eq('id', true);
    await as.hr!.from('salary_structures').insert({ employee_id: ids.designer!, effective_from: '2026-01-01', basic: 30000, pf_applies: false, esi_applies: false });
    const { data: run } = await as.hr!.rpc('start_payroll_run', { p_month: '2026-09-01' });
    await as.hr!.rpc('submit_payroll_run', { p_run: run as string });
    await as.finance!.rpc('decide_payroll_run', { p_run: run as string, p_approve: true, p_note: '' });
    const { data: runRow } = await admin.from('payroll_runs').select('total_net').eq('id', run as string).single();
    const { error } = await as.finance!.rpc('mark_payroll_paid', {
      p_run: run as string, p_paid_on: today, p_method: 'bank_transfer', p_reference: 'SAL-SEP', p_account: bank,
    });
    expect(error).toBeNull();

    const { data: expenses } = await admin.from('expense_records').select('id, amount, bank_account_id, source').eq('source_id', run as string);
    expect(expenses).toHaveLength(1);
    expect(expenses![0]).toMatchObject({ amount: Number(runRow!.total_net), bank_account_id: bank, source: 'payroll' });

    expect((await as.finance!.from('expense_records').update({ amount: 1 }).eq('id', expenses![0]!.id)).error?.message).toContain('automatically');
    expect((await as.finance!.rpc('remove_ledger_entry', { p_kind: 'expense', p_id: expenses![0]!.id, p_reason: 'Try' })).error).not.toBeNull();
  });

  it('lists every movement once, from its own source', async () => {
    const { data, error } = await as.finance!.rpc('get_money_movements', { p_from: '2026-01-01', p_to: today, p_limit: 500 });
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.filter((row) => row.kind === 'invoice_payment' && row.linked_id === invoiceId)).toHaveLength(1);
    expect(rows.filter((row) => row.kind === 'payroll')).toHaveLength(1);
    expect(rows.some((row) => row.amount === 999)).toBe(false);

    const payment = rows.find((row) => row.kind === 'invoice_payment');
    expect(payment?.bank_account_id).toBe(bank);
    expect(Number(rows[0]?.total_in)).toBe(4000 + 1500);

    const onlyCash = await as.finance!.rpc('get_money_movements', { p_from: '2026-01-01', p_to: today, p_account: cash });
    expect((onlyCash.data ?? []).every((row) => row.bank_account_id === cash)).toBe(true);
  });

  it('works out balances: opening plus money in less money out', async () => {
    const { data: salary } = await admin.from('expense_records').select('amount').eq('source', 'payroll').single();
    const map = await balances();
    // 1,00,000 opening + 4,000 invoice payment + 1,500 income - 25,000 rent - salaries.
    expect(map.get(bank)).toBe(100000 + 4000 + 1500 - 25000 - Number(salary!.amount));
    expect(map.get(cash)).toBe(0);
  });

  it('imports a statement once, and reconciles lines to movements', async () => {
    const rows = [
      { date: today, description: 'NEFT from Ledger client', reference: 'UTR-1', amount: 4000 },
      { date: today, description: 'Rent November', reference: 'RENT-NOV', amount: -25000 },
      { date: today, description: 'Card charge', reference: '', amount: -118 },
    ];
    const first = await as.finance!.rpc('import_statement_lines', { p_account: bank, p_rows: rows });
    expect(first.data).toMatchObject({ imported: 3, skipped: 0 });
    const again = await as.finance!.rpc('import_statement_lines', { p_account: bank, p_rows: rows });
    expect(again.data).toMatchObject({ imported: 0, skipped: 3 });
    expect((await as.hr!.rpc('import_statement_lines', { p_account: bank, p_rows: rows })).error?.message).toContain('permission');

    const { data: suggestions } = await as.finance!.rpc('get_statement_suggestions', { p_account: bank });
    expect(suggestions?.map((row) => row.kind).sort()).toEqual(['expense', 'invoice_payment']);

    const { data: lines } = await admin.from('bank_statement_lines').select('id, amount').eq('bank_account_id', bank);
    const rentLine = lines!.find((line) => line.amount === -25000)!;
    const chargeLine = lines!.find((line) => line.amount === -118)!;
    const rentSuggestion = suggestions!.find((row) => row.line_id === rentLine.id)!;

    expect((await as.finance!.rpc('match_statement_line', { p_line: chargeLine.id, p_kind: rentSuggestion.kind, p_id: rentSuggestion.movement_id })).error?.message).toContain('do not match');
    expect((await as.finance!.rpc('match_statement_line', { p_line: rentLine.id, p_kind: rentSuggestion.kind, p_id: rentSuggestion.movement_id })).error).toBeNull();

    const { data: after } = await as.finance!.rpc('get_statement_suggestions', { p_account: bank });
    expect(after?.some((row) => row.line_id === rentLine.id)).toBe(false);
    expect((await as.finance!.rpc('unmatch_statement_line', { p_line: rentLine.id })).error).toBeNull();
  });

  it('keeps system categories in place', async () => {
    const salaries = (await admin.from('finance_categories').select('id').eq('system_key', 'salaries').single()).data!.id;
    expect((await as.finance!.from('finance_categories').update({ is_active: false }).eq('id', salaries)).error?.message).toContain('automatically');
    expect((await as.finance!.from('finance_categories').delete().eq('id', salaries)).error?.message).toContain('automatically');
    expect((await as.finance!.from('finance_categories').update({ name: 'Staff salaries' }).eq('id', salaries).select('id')).data).toHaveLength(1);
  });
});
