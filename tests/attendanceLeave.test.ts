// Stage 3 of HR and Finance: working from home, breaks, the day status HR sets, leave
// carried forward at year end, the leave report, and holiday types.
import { beforeAll, describe, expect, it } from 'vitest';
import { leaveTypeSchema } from '@/lib/validation/hrSchema';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();

describe('attendance and leave', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'head');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'head');
  });

  describe('a working day', () => {
    it('records working from home at check-in', async () => {
      expect((await as.designer!.rpc('attendance_check_in', { p_work_mode: 'wfh' })).error).toBeNull();
      const { data } = await as.designer!.from('attendance_records').select('work_mode').eq('employee_id', ids.designer!);
      expect(data).toEqual([{ work_mode: 'wfh' }]);
      expect((await as.colleague!.rpc('attendance_check_in')).error).toBeNull();
    });

    it('takes one break at a time, and only after checking in', async () => {
      expect((await as.head!.rpc('attendance_start_break')).error?.message).toContain('Check in first');
      expect((await as.designer!.rpc('attendance_end_break')).error?.message).toContain('not on a break');

      expect((await as.designer!.rpc('attendance_start_break')).error).toBeNull();
      expect((await as.designer!.rpc('attendance_start_break')).error?.message).toContain('already on a break');
      expect((await as.designer!.rpc('attendance_end_break')).error).toBeNull();
      expect((await as.designer!.rpc('attendance_start_break')).error).toBeNull();
    });

    it('ends a running break at check-out', async () => {
      expect((await as.designer!.rpc('attendance_check_out')).error).toBeNull();
      const { data } = await as.designer!.from('attendance_breaks').select('ended_at').eq('employee_id', ids.designer!);
      expect(data).toHaveLength(2);
      expect((data ?? []).every((entry) => entry.ended_at !== null)).toBe(true);
    });

    it('keeps breaks to the person and those who see their attendance, and only the buttons add them', async () => {
      expect((await as.colleague!.from('attendance_breaks').select('id').eq('employee_id', ids.designer!)).data).toEqual([]);
      expect((await as.hr!.from('attendance_breaks').select('id').eq('employee_id', ids.designer!)).data).toHaveLength(2);

      const forged = await as.colleague!.from('attendance_breaks').insert({
        attendance_id: (await admin.from('attendance_records').select('id').eq('employee_id', ids.colleague!).single()).data!.id,
        employee_id: ids.colleague!,
      });
      expect(forged.error).not.toBeNull();
    });

    it('lets HR set a day status, and reports breaks and work mode', async () => {
      const { data, error } = await as.hr!
        .from('attendance_records')
        .upsert(
          { employee_id: ids.colleague!, work_date: '2026-10-05', status_override: 'half_day', work_mode: 'office', note: 'Left at lunch' },
          { onConflict: 'employee_id,work_date' },
        )
        .select('source, status_override');
      expect(error).toBeNull();
      expect(data).toEqual([{ source: 'manual', status_override: 'half_day' }]);

      const own = await as.colleague!.from('attendance_records').update({ status_override: 'present' }).eq('employee_id', ids.colleague!).eq('work_date', '2026-10-05');
      expect(own.error?.message ?? 'refused').toMatch(/own attendance|refused/);

      const report = (await as.hr!.rpc('get_attendance_report_data', { p_from: '2026-10-01', p_to: '2026-10-31' })).data as {
        records: { employee_id: string; status_override: string | null; break_minutes: number }[];
      };
      expect(report.records.find((record) => record.employee_id === ids.colleague!)?.status_override).toBe('half_day');
    });
  });

  describe('carrying leave forward', () => {
    let lapsing = '';
    let lasting = '';

    beforeAll(async () => {
      const make = async (name: string, cap: number, expiry: number | null) =>
        (
          await admin
            .from('leave_types')
            .insert({ name: `${name} ${runId}`, yearly_allowance: 10, carry_forward_cap: cap, carry_forward_expiry_months: expiry, is_encashable: true })
            .select('id')
            .single()
        ).data!.id;
      lapsing = await make('Lapsing leave', 5, 3);
      lasting = await make('Lasting leave', 4, null);

      // Three days of each taken in 2025: Monday to Wednesday, a week apart.
      for (const [type, start, end] of [
        [lapsing, '2025-03-03', '2025-03-05'],
        [lasting, '2025-03-10', '2025-03-12'],
      ] as const) {
        const { data, error } = await admin
          .from('leave_requests')
          .insert({ employee_id: ids.designer!, leave_type_id: type, start_date: start, end_date: end, reason: 'Family trip' })
          .select('id')
          .single();
        expect(error).toBeNull();
        await admin.from('leave_requests').update({ status: 'approved' }).eq('id', data!.id);
      }
    });

    it('is run by HR only, and only for a finished year', async () => {
      expect((await as.designer!.rpc('carry_forward_leave', { p_year: 2025 })).error?.message).toContain('permission');
      const thisYear = Number(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 4));
      expect((await as.hr!.rpc('carry_forward_leave', { p_year: thisYear })).error?.message).toContain('once the year is over');
    });

    it('moves unused days up to each cap, and recalculates when run again', async () => {
      expect((await as.hr!.rpc('carry_forward_leave', { p_year: 2025 })).error).toBeNull();
      expect((await as.hr!.rpc('carry_forward_leave', { p_year: 2025 })).error).toBeNull();

      const { data } = await admin
        .from('leave_carry_forwards')
        .select('leave_type_id, days, expires_on')
        .eq('employee_id', ids.designer!)
        .eq('from_year', 2025);
      const byType = new Map((data ?? []).map((row) => [row.leave_type_id, row]));
      expect(data?.filter((row) => row.leave_type_id === lapsing || row.leave_type_id === lasting)).toHaveLength(2);
      // 10 allowed, 3 taken, so 7 unused: capped at 5 and at 4.
      expect(Number(byType.get(lapsing)?.days)).toBe(5);
      expect(byType.get(lapsing)?.expires_on).toBe('2026-03-31');
      expect(Number(byType.get(lasting)?.days)).toBe(4);
      expect(byType.get(lasting)?.expires_on).toBeNull();

      // Someone who took nothing carries the full cap.
      const { data: colleague } = await admin.from('leave_carry_forwards').select('days').eq('employee_id', ids.colleague!).eq('leave_type_id', lasting);
      expect(colleague?.map((row) => Number(row.days))).toEqual([4]);
    });

    it('adds carried days to the balance until they lapse', async () => {
      const { data } = await as.designer!.rpc('get_leave_balances', { p_year: 2026 });
      const lastingRow = (data ?? []).find((row) => row.leave_type_id === lasting);
      expect(Number(lastingRow?.carried_forward)).toBe(4);
      expect(Number(lastingRow?.remaining)).toBe(14);
      expect(lastingRow?.is_encashable).toBe(true);

      // The lapsing days expired on 31 March 2026 unused, so they no longer count.
      const lapsingRow = (data ?? []).find((row) => row.leave_type_id === lapsing);
      expect(Number(lapsingRow?.carried_forward)).toBe(0);
      expect(Number(lapsingRow?.remaining)).toBe(10);
    });

    it('lets carried days be booked on top of the allowance', async () => {
      // 12 working days from Monday 7 December 2026 is more than 10, but within 14.
      const { error } = await as.designer!.from('leave_requests').insert({
        employee_id: ids.designer!,
        leave_type_id: lasting,
        start_date: '2026-12-07',
        end_date: '2026-12-22',
        reason: 'Long holiday',
      });
      expect(error).toBeNull();

      const tooMany = await as.designer!.from('leave_requests').insert({
        employee_id: ids.designer!,
        leave_type_id: lasting,
        start_date: '2026-12-28',
        end_date: '2026-12-31',
        reason: 'Even longer',
      });
      expect(tooMany.error?.message).toContain('Not enough');
    });

    it('shows the leave report to HR only', async () => {
      const { data, error } = await as.hr!.rpc('get_leave_utilisation', { p_year: 2025 });
      expect(error).toBeNull();
      const row = (data ?? []).find((entry) => entry.employee_id === ids.designer! && entry.leave_type_id === lasting);
      expect(row).toMatchObject({ is_encashable: true });
      expect(Number(row?.approved)).toBe(3);
      expect(Number(row?.remaining)).toBe(7);

      for (const key of ['designer', 'head']) {
        expect((await as[key]!.rpc('get_leave_utilisation', { p_year: 2025 })).error?.message, key).toContain('permission');
      }
    });

    it('needs a yearly allowance before leave can carry forward', () => {
      const base = { name: 'Unpaid', isPaid: false, requiresAttachment: false, isActive: true, carryForwardExpiryMonths: '', isEncashable: false };
      expect(leaveTypeSchema.safeParse({ ...base, yearlyAllowance: '', carryForwardCap: '5' }).success).toBe(false);
      expect(leaveTypeSchema.safeParse({ ...base, yearlyAllowance: '12', carryForwardCap: '5' }).success).toBe(true);
    });
  });

  describe('holidays', () => {
    it('keeps a type and description, and only HR adds them', async () => {
      const { data, error } = await as.hr!
        .from('holidays')
        .insert({ holiday_date: '2031-08-15', name: `Independence Day ${runId}`, kind: 'public', description: 'National holiday' })
        .select('kind, description')
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({ kind: 'public', description: 'National holiday' });

      expect((await as.hr!.from('holidays').insert({ holiday_date: '2031-08-16', name: 'Odd', kind: 'regional' })).error).not.toBeNull();
      expect((await as.designer!.from('holidays').insert({ holiday_date: '2031-08-17', name: 'Mine', kind: 'company' })).error).not.toBeNull();
    });
  });
});
