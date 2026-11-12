// Stages 5 and 6 of HR and Finance: recruitment (who sees candidates, interviews on the
// calendar, interviewer feedback, converting to an employee, onboarding) and exits
// (resigning, deciding, the checklist, the full and final settlement and the nightly
// job that ends access).
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('recruitment and exits', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'head');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'head');
  });

  describe('recruitment', () => {
    let candidateId = '';
    let interviewId = '';

    beforeAll(async () => {
      const { data: opening } = await as.hr!.from('job_openings').insert({ title: 'UI Designer', positions: 2 }).select('id').single();
      const { data, error } = await as.hr!
        .from('candidates')
        .insert({ opening_id: opening!.id, full_name: `Kavya ${runId}`, email: 'kavya@example.com', position: 'UI Designer', skills: ['Figma'], expected_salary: 600000 })
        .select('id, stage')
        .single();
      expect(error).toBeNull();
      expect(data?.stage).toBe('new');
      candidateId = data!.id;
    });

    it('keeps candidates and openings with recruiters', async () => {
      for (const key of ['designer', 'finance', 'head']) {
        expect((await as[key]!.from('candidates').select('id').eq('id', candidateId)).data, key).toEqual([]);
        expect((await as[key]!.from('job_openings').select('id')).data, key).toEqual([]);
      }
      expect((await as.designer!.from('candidates').insert({ full_name: 'Sneaky' })).error).not.toBeNull();
      const { data: notes } = await admin.from('notifications').select('kind').eq('recipient_id', ids.founder!).eq('kind', 'candidate_added');
      expect(notes).toHaveLength(1);
    });

    it('puts an interview on the calendar with the interviewer, who then sees the candidate', async () => {
      const { data, error } = await as.hr!.rpc('schedule_interview', {
        p_candidate: candidateId, p_round: 'Design round', p_at: '2030-01-15T05:30:00Z', p_minutes: 45,
        p_interviewer: ids.designer!, p_mode: 'video', p_location: '', p_link: 'https://meet.example.com/abc',
      });
      expect(error).toBeNull();
      interviewId = data as string;

      const { data: interview } = await admin.from('interviews').select('meeting_id').eq('id', interviewId).single();
      const { data: invited } = await admin.from('meeting_participants').select('employee_id').eq('meeting_id', interview!.meeting_id!);
      expect(invited?.map((row) => row.employee_id)).toEqual([ids.designer!]);
      expect((await admin.from('candidates').select('stage').eq('id', candidateId).single()).data?.stage).toBe('interview_scheduled');

      expect((await as.designer!.from('candidates').select('full_name').eq('id', candidateId)).data).toHaveLength(1);
      expect((await as.designer!.from('interviews').select('id').eq('id', interviewId)).data).toHaveLength(1);
      expect((await as.colleague!.from('candidates').select('id').eq('id', candidateId)).data).toEqual([]);
      expect((await as.colleague!.rpc('schedule_interview', {
        p_candidate: candidateId, p_round: 'x', p_at: '2030-01-16T05:30:00Z', p_minutes: 30, p_interviewer: ids.colleague!, p_mode: 'phone', p_location: '', p_link: '',
      })).error?.message).toContain('permission');
    });

    it('shares candidate files with recruiters and interviewers only', async () => {
      const { data: file, error } = await as.hr!
        .from('files')
        .insert({ kind: 'link', name: 'Kavya resume', external_url: 'https://example.com/cv', candidate_id: candidateId })
        .select('id')
        .single();
      expect(error).toBeNull();
      expect((await as.designer!.from('files').select('id').eq('id', file!.id)).data).toHaveLength(1);
      expect((await as.colleague!.from('files').select('id').eq('id', file!.id)).data).toEqual([]);
      expect((await as.founder!.from('files').select('id').eq('id', file!.id)).data).toHaveLength(1);
      expect((await as.designer!.from('files').insert({ kind: 'link', name: 'x', external_url: 'https://example.com/x', candidate_id: candidateId })).error?.message).toContain('recruiters');
    });

    it('lets the interviewer record feedback, which moves the candidate on', async () => {
      expect((await as.colleague!.rpc('record_interview_outcome', { p_interview: interviewId, p_status: 'completed', p_feedback: 'x', p_rating: 3 })).error?.message).toContain('permission');
      expect((await as.designer!.rpc('record_interview_outcome', { p_interview: interviewId, p_status: 'completed', p_feedback: 'Strong', p_rating: null as unknown as number })).error?.message).toContain('rating');
      expect((await as.designer!.rpc('record_interview_outcome', { p_interview: interviewId, p_status: 'completed', p_feedback: 'Strong portfolio', p_rating: 4 })).error).toBeNull();
      expect((await admin.from('candidates').select('stage').eq('id', candidateId).single()).data?.stage).toBe('interview_done');
    });

    it('marks someone joined only by converting them, which starts onboarding', async () => {
      const joined = await as.hr!.from('candidates').update({ stage: 'joined' }).eq('id', candidateId);
      expect(joined.error?.message).toContain('Convert');
      const linked = await as.hr!.from('candidates').update({ employee_id: ids.colleague! }).eq('id', candidateId);
      expect(linked.error?.message).toContain('Convert');

      expect((await as.hr!.from('candidates').update({ stage: 'offer_accepted', offered_salary: 650000 }).eq('id', candidateId).select('id')).data).toHaveLength(1);
      const newcomer = await people.addPerson('newcomer', 'Employee', 'Design & Development', 'head');
      void newcomer;
      expect((await as.designer!.rpc('complete_candidate_conversion', { p_candidate: candidateId, p_employee: ids.newcomer! })).error?.message).toContain('permission');
      expect((await as.hr!.rpc('complete_candidate_conversion', { p_candidate: candidateId, p_employee: ids.newcomer! })).error).toBeNull();
      expect((await as.hr!.rpc('complete_candidate_conversion', { p_candidate: candidateId, p_employee: ids.newcomer! })).error?.message).toContain('already');

      const { data: candidate } = await admin.from('candidates').select('stage, employee_id').eq('id', candidateId).single();
      expect(candidate).toEqual({ stage: 'joined', employee_id: ids.newcomer! });
      const { data: tasks } = await as.newcomer!.from('onboarding_tasks').select('id, item_name').order('sort_order');
      expect(tasks?.map((task) => task.item_name)).toEqual(['Documents verified', 'Laptop given', 'Accounts created']);

      expect((await as.newcomer!.rpc('set_onboarding_task', { p_task: tasks![0]!.id, p_done: true })).error?.message).toContain('permission');
      expect((await as.hr!.rpc('set_onboarding_task', { p_task: tasks![0]!.id, p_done: true })).error).toBeNull();
    });

    it('keeps letter templates with recruiters and HR', async () => {
      expect((await as.hr!.from('letter_templates').select('kind')).data?.map((row) => row.kind).sort()).toEqual(['experience', 'internship_completion', 'offer', 'relieving']);
      expect((await as.designer!.from('letter_templates').select('id')).data).toEqual([]);
    });
  });

  describe('exits', () => {
    let resignationId = '';

    beforeAll(async () => {
      await admin.from('company_settings').update({ notice_period_days: 30 }).eq('id', true);
      await admin.from('salary_structures').insert({ employee_id: ids.designer!, effective_from: '2026-01-01', basic: 30000 });
      await admin.from('employees').update({ joining_date: '2025-01-01' }).eq('id', ids.designer!);
      await admin.from('leave_types').update({ is_encashable: true }).eq('name', 'Earned Leave');
    });

    it('lets people resign once at a time, only for themselves', async () => {
      expect((await as.designer!.from('resignations').insert({ employee_id: ids.designer!, reason: 'Moving city', proposed_last_day: '2020-01-01' })).error?.message).toContain('past');

      const first = await as.designer!.from('resignations').insert({ employee_id: ids.colleague!, reason: 'Moving city' }).select('id, employee_id, notice_days').single();
      expect(first.error).toBeNull();
      // The database sets whose resignation it is, and the notice period in force.
      expect(first.data).toMatchObject({ employee_id: ids.designer!, notice_days: 30 });
      expect((await as.designer!.from('resignations').insert({ employee_id: ids.designer!, reason: 'Again' })).error?.message).toContain('already');

      const withdrawn = await as.designer!.from('resignations').update({ status: 'withdrawn' }).eq('id', first.data!.id).select('status');
      expect(withdrawn.data).toEqual([{ status: 'withdrawn' }]);

      const second = await as.designer!.from('resignations').insert({ employee_id: ids.designer!, reason: 'Higher studies' }).select('id').single();
      resignationId = second.data!.id;
    });

    it('tells HR and the manager, and shows it only to them and the person', async () => {
      for (const key of ['hr', 'head']) {
        const { data } = await admin.from('notifications').select('title').eq('recipient_id', ids[key]!).eq('kind', 'resignation_submitted');
        expect((data ?? []).some((row) => row.title.includes('resigned')), key).toBe(true);
      }
      expect((await as.head!.from('resignations').select('id').eq('id', resignationId)).data).toHaveLength(1);
      expect((await as.colleague!.from('resignations').select('id').eq('id', resignationId)).data).toEqual([]);
    });

    it('is decided by HR only, never by the person', async () => {
      const own = await as.designer!.from('resignations').update({ status: 'approved' }).eq('id', resignationId);
      expect(own.error?.message).toContain('cannot be changed');
      expect((await as.head!.rpc('decide_resignation', { p_resignation: resignationId, p_approve: true, p_last_day: null as unknown as string, p_note: '' })).error?.message).toContain('permission');
      expect((await as.hr!.rpc('decide_resignation', { p_resignation: resignationId, p_approve: false, p_last_day: null as unknown as string, p_note: '' })).error?.message).toContain('reason');
    });

    it('on approval sets the last day, the checklist and notice', async () => {
      const { error } = await as.hr!.rpc('decide_resignation', {
        p_resignation: resignationId, p_approve: true, p_last_day: '2026-12-10', p_note: 'All the best',
      });
      expect(error).toBeNull();

      const { data: resignation } = await admin.from('resignations').select('status, last_working_day').eq('id', resignationId).single();
      expect(resignation).toEqual({ status: 'approved', last_working_day: '2026-12-10' });
      expect((await admin.from('employees').select('employment_status').eq('id', ids.designer!).single()).data?.employment_status).toBe('notice_period');
      expect((await as.hr!.from('exit_tasks').select('id').eq('resignation_id', resignationId)).data).toHaveLength(6);
      const { data: notes } = await admin.from('notifications').select('body').eq('recipient_id', ids.designer!).eq('kind', 'resignation_decided');
      expect(notes?.[0]?.body).toContain('10 Dec 2026');
    });

    it('suggests the settlement: pending salary, leave encashment and notice recovery', async () => {
      const { data, error } = await as.hr!.rpc('get_settlement_suggestion', { p_resignation: resignationId });
      expect(error).toBeNull();
      const suggestion = data as Record<string, number>;
      // 10 of 31 December days of 30,000.
      expect(suggestion.pendingSalary).toBe(9677.42);
      // 15 unused Earned Leave days at 30,000 basic / 30.
      expect(suggestion.encashableDays).toBe(15);
      expect(suggestion.encashmentAmount).toBe(15000);
      expect(suggestion.shortfallDays).toBeGreaterThanOrEqual(0);
      expect((await as.colleague!.rpc('get_settlement_suggestion', { p_resignation: resignationId })).error?.message).toContain('permission');
    });

    it('works out the final amount, and only Finance pays it', async () => {
      const { data, error } = await as.hr!
        .from('final_settlements')
        .update({ pending_salary: 9677.42, leave_encashment_days: 15, leave_encashment_amount: 15000, notice_recovery: 2000, other_deductions: 500 })
        .eq('resignation_id', resignationId)
        .select('final_amount');
      expect(error).toBeNull();
      expect(data).toEqual([{ final_amount: 22177.42 }]);

      const forged = await as.hr!.from('final_settlements').update({ status: 'paid' }).eq('resignation_id', resignationId);
      expect(forged.error?.message).toContain('Finance');
      expect((await as.hr!.rpc('mark_settlement_paid', { p_resignation: resignationId, p_paid_on: '2026-11-10', p_method: 'bank_transfer', p_reference: '' })).error?.message).toContain('permission');
      expect((await as.finance!.rpc('mark_settlement_paid', { p_resignation: resignationId, p_paid_on: '2026-11-10', p_method: 'bank_transfer', p_reference: 'NEFT9' })).error).toBeNull();
      expect((await as.hr!.from('final_settlements').update({ other_deductions: 0 }).eq('resignation_id', resignationId)).error?.message).toContain('paid');

      expect((await as.designer!.from('final_settlements').select('final_amount')).data).toEqual([{ final_amount: 22177.42 }]);
      expect((await as.colleague!.from('final_settlements').select('final_amount')).data).toEqual([]);
    });

    it('pays only up to the last working day, and leaves them off later months', async () => {
      const { data } = await admin.rpc('employee_last_day', { p_employee: ids.designer! });
      expect(data).toBe('2026-12-10');

      const { data: december } = await as.hr!.rpc('start_payroll_run', { p_month: '2026-12-01' });
      const { data: line } = await admin.from('payroll_lines').select('paid_days, days_in_month').eq('run_id', december as string).eq('employee_id', ids.designer!).single();
      expect(line).toEqual({ paid_days: 10, days_in_month: 31 });

      const { data: january } = await as.hr!.rpc('start_payroll_run', { p_month: '2027-01-01' });
      expect((await admin.from('payroll_lines').select('id').eq('run_id', january as string).eq('employee_id', ids.designer!)).data).toEqual([]);
    });

    it('ends access after the last working day, keeping the history', async () => {
      await admin.from('resignations').update({ last_working_day: '2026-11-01' }).eq('id', resignationId);
      const { data, error } = await admin.rpc('process_exits');
      expect(error).toBeNull();
      expect(data).toBe(1);

      const { data: employee } = await admin.from('employees').select('employment_status, is_active, auth_user_id').eq('id', ids.designer!).single();
      expect(employee).toMatchObject({ employment_status: 'exited', is_active: false });
      expect((await admin.from('resignations').select('status').eq('id', resignationId).single()).data?.status).toBe('completed');
      // Access is gone: the old session reads nothing.
      expect((await as.designer!.from('resignations').select('id')).data).toEqual([]);
    });
  });
});
