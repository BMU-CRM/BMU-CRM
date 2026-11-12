// Stage 4 of HR and Finance: payroll. Net pay, loss of pay from unpaid leave and
// absences, PF, ESI, professional tax and TDS from the rules HR enters, components,
// revisions, and who may prepare, approve, pay and see payslips.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/databaseTypes';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('payroll', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let runIdOctober = '';

  async function line(run: string, employee: string) {
    const { data } = await admin.from('payroll_lines').select('*').eq('run_id', run).eq('employee_id', employee).single();
    return data!;
  }

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'founder');
    for (const key of ['designer', 'colleague']) {
      await admin.from('employees').update({ joining_date: '2026-01-01' }).eq('id', ids[key]!);
    }
    // Only these two are paid, so the run is predictable.
    await admin.from('employees').update({ is_active: false }).not('id', 'in', `(${[ids.designer, ids.colleague, ids.hr, ids.finance, ids.founder].join(',')})`);
  });

  it('warns about rules that are not set up, rather than guessing rates', async () => {
    await as.hr!.from('salary_structures').insert({ employee_id: ids.colleague!, effective_from: '2026-01-01', basic: 10000 });
    const { data, error: costError } = await as.hr!.rpc('get_salary_structure_costs', { p_employee: ids.colleague! });
    expect(costError).toBeNull();
    expect(data?.[0]?.warnings).toEqual(expect.arrayContaining(['PF is not set up', 'ESI is not set up', 'TDS is not set up']));
    expect(Number(data?.[0]?.employer_pf)).toBe(0);
  });

  describe('rules and structures', () => {
    beforeAll(async () => {
      const rules: Database['public']['Tables']['payroll_rules']['Insert'][] = [
        { kind: 'pf', effective_from: '2026-01-01', employee_rate: 12, employer_rate: 12, wage_limit: 15000 },
        { kind: 'esi', effective_from: '2026-01-01', employee_rate: 0.75, employer_rate: 3.25, wage_limit: 21000 },
        { kind: 'pt', effective_from: '2026-01-01', state: 'Tamil Nadu', slabs: [{ from: 0, to: 21000, amount: 0 }, { from: 21000.01, to: null, amount: 208 }] },
        { kind: 'tds', effective_from: '2026-01-01', employee_rate: 10, wage_limit: 500000 },
      ];
      for (const rule of rules) {
        const { error } = await as.hr!.from('payroll_rules').insert(rule);
        expect(error).toBeNull();
      }
      const { error } = await as.hr!
        .from('salary_structures')
        .insert({ employee_id: ids.designer!, effective_from: '2026-01-01', basic: 20000, hra: 8000, special_allowance: 7000, pt_state: 'Tamil Nadu' });
      expect(error).toBeNull();
      await admin.from('company_settings').update({ payroll_absence_lop: false }).eq('id', true);
    });

    it('keeps rules and structures with payroll people', async () => {
      expect((await as.designer!.from('payroll_rules').insert({ kind: 'tds', effective_from: '2027-01-01', employee_rate: 1 })).error).not.toBeNull();
      expect((await as.designer!.from('salary_structures').insert({ employee_id: ids.designer!, effective_from: '2027-01-01', basic: 99999 })).error).not.toBeNull();
      expect((await as.colleague!.from('salary_structures').select('id').eq('employee_id', ids.designer!)).data).toEqual([]);
      expect((await as.designer!.from('salary_structures').select('basic').eq('employee_id', ids.designer!)).data).toEqual([{ basic: 20000 }]);
    });

    it('works out monthly and yearly cost to the company', async () => {
      const { data } = await as.hr!.rpc('get_salary_structure_costs', { p_employee: ids.designer! });
      // 35,000 gross; employer PF 12% of basic capped at 15,000 = 1,800; ESI does not apply above 21,000.
      expect(Number(data?.[0]?.gross)).toBe(35000);
      expect(Number(data?.[0]?.employer_pf)).toBe(1800);
      expect(Number(data?.[0]?.employer_esi)).toBe(0);
      expect(Number(data?.[0]?.monthly_ctc)).toBe(36800);
      expect(Number(data?.[0]?.annual_ctc)).toBe(441600);
    });
  });

  describe('a payroll run', () => {
    it('can only be started by payroll people, once a month', async () => {
      expect((await as.designer!.rpc('start_payroll_run', { p_month: '2026-10-01' })).error?.message).toContain('permission');
      expect((await as.finance!.rpc('start_payroll_run', { p_month: '2026-10-01' })).error?.message).toContain('permission');
      const { data, error } = await as.hr!.rpc('start_payroll_run', { p_month: '2026-10-15' });
      expect(error).toBeNull();
      runIdOctober = data as string;
      expect((await as.hr!.rpc('start_payroll_run', { p_month: '2026-10-01' })).error?.message).toContain('already');
    });

    it('works out a full month', async () => {
      const designer = await line(runIdOctober, ids.designer!);
      expect(designer).toMatchObject({ days_in_month: 31, paid_days: 31, lop_days: 0 });
      expect(Number(designer.gross_earnings)).toBe(35000);
      expect(Number(designer.pf_employee)).toBe(1800);
      expect(Number(designer.esi_employee)).toBe(0);
      expect(Number(designer.professional_tax)).toBe(208);
      // 4,20,000 a year is under the 5,00,000 TDS threshold.
      expect(Number(designer.tds)).toBe(0);
      expect(Number(designer.net_pay)).toBe(32992);
    });

    it('applies ESI and TDS where they apply', async () => {
      const colleague = await line(runIdOctober, ids.colleague!);
      // 10,000 gross: PF 1,200, ESI 0.75% = 75, no professional tax (no state), no TDS.
      expect(Number(colleague.pf_employee)).toBe(1200);
      expect(Number(colleague.esi_employee)).toBe(75);
      expect(Number(colleague.esi_employer)).toBe(325);
      expect(Number(colleague.net_pay)).toBe(8725);
    });

    it('takes unpaid leave off the pay', async () => {
      const unpaid = (await admin.from('leave_types').select('id').eq('name', 'Unpaid Leave').single()).data!.id;
      const { data: leave } = await admin
        .from('leave_requests')
        .insert({ employee_id: ids.designer!, leave_type_id: unpaid, start_date: '2026-10-05', end_date: '2026-10-06', reason: 'Personal work' })
        .select('id')
        .single();
      await admin.from('leave_requests').update({ status: 'approved' }).eq('id', leave!.id);

      expect((await as.hr!.rpc('recalculate_payroll_run', { p_run: runIdOctober })).error).toBeNull();
      const designer = await line(runIdOctober, ids.designer!);
      expect(designer).toMatchObject({ unpaid_leave_days: 2, lop_days: 2, paid_days: 29 });
      // 29/31 of each part: 18,709.68 + 7,483.87 + 6,548.39.
      expect(Number(designer.basic)).toBe(18709.68);
      expect(Number(designer.gross_earnings)).toBe(32741.94);
      expect(Number(designer.net_pay)).toBe(30733.94);
    });

    it('counts working days without attendance as loss of pay when the company does', async () => {
      await admin.from('company_settings').update({ payroll_absence_lop: true }).eq('id', true);
      await as.hr!.rpc('recalculate_payroll_run', { p_run: runIdOctober });
      // October 2026 has 22 weekdays; 2 are unpaid leave and 20 have no attendance.
      const designer = await line(runIdOctober, ids.designer!);
      expect(designer).toMatchObject({ absent_days: 20, unpaid_leave_days: 2, lop_days: 22, paid_days: 9 });
      expect(designer.warnings).toContain('20 working days without attendance or leave');
      await admin.from('company_settings').update({ payroll_absence_lop: false }).eq('id', true);
      await as.hr!.rpc('recalculate_payroll_run', { p_run: runIdOctober });
    });

    it('lets HR change variable pay and loss of pay on a draft, with totals kept in step', async () => {
      const designer = await line(runIdOctober, ids.designer!);
      const { error } = await as.hr!.rpc('save_payroll_line', {
        p_line: designer.id, p_incentive: 2000, p_bonus: 0, p_overtime_amount: 0, p_other_earnings: 0,
        p_other_deductions: 500, p_lop_adjustment: -2, p_notes: 'Leave regularised',
      });
      expect(error).toBeNull();
      const changed = await line(runIdOctober, ids.designer!);
      expect(changed).toMatchObject({ lop_days: 0, paid_days: 31 });
      expect(Number(changed.gross_earnings)).toBe(37000);
      expect(Number(changed.net_pay)).toBe(37000 - 1800 - 208 - 500);

      const { data: run } = await admin.from('payroll_runs').select('total_net, employee_count').eq('id', runIdOctober).single();
      expect(run?.employee_count).toBe(2);
      expect(Number(run?.total_net)).toBe(Number(changed.net_pay) + 8725);

      expect(
        (await as.designer!.rpc('save_payroll_line', {
          p_line: designer.id, p_incentive: 99999, p_bonus: 0, p_overtime_amount: 0, p_other_earnings: 0,
          p_other_deductions: 0, p_lop_adjustment: 0, p_notes: '',
        })).error?.message,
      ).toContain('permission');
    });

    it('adds salary components to everyone', async () => {
      const added = await as.hr!.from('salary_components').insert([
        { name: `Internet ${runId}`, kind: 'earning', calculation: 'fixed', amount: 1000, is_taxable: false },
        { name: `Canteen ${runId}`, kind: 'deduction', calculation: 'percentage', percentage: 1, percentage_of: 'basic', is_taxable: true },
      ]);
      expect(added.error).toBeNull();
      expect((await as.hr!.rpc('recalculate_payroll_run', { p_run: runIdOctober })).error).toBeNull();
      const colleague = await line(runIdOctober, ids.colleague!);
      expect(Number(colleague.component_earnings)).toBe(1000);
      expect(Number(colleague.component_deductions)).toBe(100);
      expect(Number(colleague.gross_earnings)).toBe(11000);
    });

    it('hides payslips until the run is paid', async () => {
      expect((await as.designer!.from('payroll_lines').select('id')).data).toEqual([]);
      expect((await as.designer!.from('payroll_runs').select('id')).data).toEqual([]);
    });

    it('goes to Finance for approval, who can send it back', async () => {
      expect((await as.hr!.rpc('submit_payroll_run', { p_run: runIdOctober })).error).toBeNull();
      const { data: notes } = await admin.from('notifications').select('kind').eq('recipient_id', ids.finance!).eq('kind', 'payroll_review');
      expect(notes).toHaveLength(1);

      expect((await as.hr!.rpc('decide_payroll_run', { p_run: runIdOctober, p_approve: true, p_note: '' })).error?.message).toContain('permission');
      expect((await as.finance!.rpc('decide_payroll_run', { p_run: runIdOctober, p_approve: false, p_note: '' })).error?.message).toContain('Say what');
      expect((await as.finance!.rpc('decide_payroll_run', { p_run: runIdOctober, p_approve: false, p_note: 'Check the incentive' })).error).toBeNull();
      expect((await admin.from('payroll_runs').select('status').eq('id', runIdOctober).single()).data?.status).toBe('draft');

      await as.hr!.rpc('submit_payroll_run', { p_run: runIdOctober });
      const designer = await line(runIdOctober, ids.designer!);
      const locked = await as.hr!.rpc('save_payroll_line', {
        p_line: designer.id, p_incentive: 1, p_bonus: 0, p_overtime_amount: 0, p_other_earnings: 0,
        p_other_deductions: 0, p_lop_adjustment: 0, p_notes: '',
      });
      expect(locked.error?.message).toContain('draft');
      expect((await as.finance!.rpc('decide_payroll_run', { p_run: runIdOctober, p_approve: true, p_note: '' })).error).toBeNull();
    });

    it('is marked paid by Finance only, and then each person sees only their own payslip', async () => {
      expect((await as.hr!.rpc('mark_payroll_paid', { p_run: runIdOctober, p_paid_on: '2026-11-01', p_method: 'bank_transfer', p_reference: 'X' })).error?.message).toContain('permission');
      const { error } = await as.finance!.rpc('mark_payroll_paid', {
        p_run: runIdOctober, p_paid_on: '2026-11-01', p_method: 'bank_transfer', p_reference: 'NEFT-123',
      });
      expect(error).toBeNull();

      const own = await as.designer!.from('payroll_lines').select('employee_id, net_pay');
      expect(own.data?.map((row) => row.employee_id)).toEqual([ids.designer!]);
      expect((await as.designer!.from('payroll_runs').select('status')).data).toEqual([{ status: 'paid' }]);
      expect((await as.colleague!.from('payroll_lines').select('id').eq('employee_id', ids.designer!)).data).toEqual([]);

      const { data: notes } = await admin.from('notifications').select('kind').eq('recipient_id', ids.designer!).eq('kind', 'salary_paid');
      expect(notes).toHaveLength(1);
      expect((await as.hr!.rpc('discard_payroll_run', { p_run: runIdOctober })).error?.message).toContain('draft');
    });
  });

  describe('revisions and appraisals', () => {
    it('records a revision when a new structure starts', async () => {
      await as.hr!.from('salary_structures').insert({
        employee_id: ids.designer!, effective_from: '2027-01-01', basic: 22000, hra: 8800, special_allowance: 7700, revision_reason: 'Annual increment',
      });
      const { data } = await as.designer!.from('salary_revisions').select('previous_gross, revised_gross, change_percent, reason');
      expect(data).toEqual([{ previous_gross: 35000, revised_gross: 38500, change_percent: 10, reason: 'Annual increment' }]);

      const { data: history } = await as.designer!.rpc('get_employment_history', { p_employee: ids.designer! });
      expect((history ?? []).some((entry) => entry.field === 'salary' && entry.new_value?.includes('+10%'))).toBe(true);
    });

    it('keeps appraisals with payroll people and the person', async () => {
      const { error } = await as.hr!.from('appraisals').insert({
        employee_id: ids.designer!, period_label: '2026', period_start: '2026-01-01', period_end: '2026-12-31', rating: 4.5, notes: 'Strong year',
      });
      expect(error).toBeNull();
      expect((await as.designer!.from('appraisals').select('rating')).data).toEqual([{ rating: 4.5 }]);
      expect((await as.colleague!.from('appraisals').select('id').eq('employee_id', ids.designer!)).data).toEqual([]);
      expect((await as.designer!.from('appraisals').insert({ employee_id: ids.designer!, period_label: 'Self', period_start: '2026-01-01', period_end: '2026-12-31', rating: 5 })).error).not.toBeNull();
    });
  });
});
