// Headcount, joinings and leavers for the HR reports, from employee and resignation
// rows. Dates are YYYY-MM-DD strings in India time.

export type ReportPerson = {
  id: string;
  employee_code: string | null;
  full_name: string;
  employment_status: string;
  joining_date: string | null;
  is_active: boolean;
  department: string | null;
  designation: string | null;
  employment_type: string | null;
};

export type ReportLeaver = { employee_id: string; last_working_day: string; reason: string | null };

type Count = { name: string; count: number };

function countBy(people: ReportPerson[], key: (person: ReportPerson) => string): Count[] {
  const counts = new Map<string, number>();
  for (const person of people) counts.set(key(person), (counts.get(key(person)) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Who was on the books on a day: joined by then, and not yet past their last day.
function onBooks(person: ReportPerson, day: string, lastDays: Map<string, string>) {
  const left = lastDays.get(person.id);
  return (person.joining_date ?? '0000-01-01') <= day && (!left || left >= day) && (person.is_active || Boolean(left));
}

export type LeaveSummaryRow = { leaveType: string; people: number; allowance: number | null; approved: number; pending: number };

// Leave rows per person and type, totalled per type. Allowance includes carried-forward
// days; a type with no yearly limit stays without one.
export function summariseLeave(
  rows: { leave_type: string; yearly_allowance: number | null; carried_forward: number; approved: number; pending: number }[],
): LeaveSummaryRow[] {
  const byType = new Map<string, LeaveSummaryRow>();
  for (const row of rows) {
    const entry = byType.get(row.leave_type) ?? { leaveType: row.leave_type, people: 0, allowance: row.yearly_allowance === null ? null : 0, approved: 0, pending: 0 };
    entry.people += 1;
    if (entry.allowance !== null && row.yearly_allowance !== null) entry.allowance += row.yearly_allowance + row.carried_forward;
    entry.approved += row.approved;
    entry.pending += row.pending;
    byType.set(row.leave_type, entry);
  }
  return [...byType.values()].sort((a, b) => b.approved - a.approved || a.leaveType.localeCompare(b.leaveType));
}

export function summarisePeople(people: ReportPerson[], leavers: ReportLeaver[], range: { from: string; to: string }) {
  const lastDays = new Map(leavers.map((row) => [row.employee_id, row.last_working_day]));
  const current = people.filter((person) => person.is_active && person.employment_status !== 'exited');
  const joiners = people
    .filter((person) => person.joining_date !== null && person.joining_date >= range.from && person.joining_date <= range.to)
    .sort((a, b) => (a.joining_date ?? '').localeCompare(b.joining_date ?? ''));
  const byId = new Map(people.map((person) => [person.id, person]));
  const left = leavers
    .filter((row) => row.last_working_day >= range.from && row.last_working_day <= range.to)
    .map((row) => ({ ...row, person: byId.get(row.employee_id) ?? null }))
    .sort((a, b) => a.last_working_day.localeCompare(b.last_working_day));

  const atStart = people.filter((person) => onBooks(person, range.from, lastDays)).length;
  const atEnd = people.filter((person) => onBooks(person, range.to, lastDays)).length;
  const average = (atStart + atEnd) / 2;

  return {
    headcount: current.length,
    atStart,
    atEnd,
    joined: joiners.length,
    left: left.length,
    // Leavers as a share of the average headcount over the period.
    attritionRate: average > 0 ? Math.round((left.length / average) * 1000) / 10 : 0,
    byDepartment: countBy(current, (person) => person.department ?? 'No department'),
    byType: countBy(current, (person) => person.employment_type ?? 'Not set'),
    byStatus: countBy(current, (person) => person.employment_status),
    joiners,
    leavers: left,
  };
}
