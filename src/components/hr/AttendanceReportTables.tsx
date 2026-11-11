import Link from 'next/link';
import tableStyles from '@/components/ui/DataTable.module.css';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  dayStatusLabels,
  formatWorkedTime,
  indiaClock,
  type AttendanceDay,
  type DayStatus,
  type EmployeeAttendance,
} from '@/lib/attendance/summariseAttendance';
import { formatDate } from '@/lib/formatDate';
import styles from './AttendanceReportTables.module.css';

function hours(minutes: number) {
  return minutes > 0 ? formatWorkedTime(minutes) : '—';
}

function PersonCell({ row, month }: { row: EmployeeAttendance; month: string }) {
  return (
    <td>
      <Link href={`/attendance/report?view=employee&month=${month}&employeeId=${row.employeeId}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
        {row.name}
      </Link>
      <p className={tableStyles.secondaryText}>{row.department ?? 'No department'}</p>
    </td>
  );
}

export function AttendanceSummaryTable({ rows, month }: { rows: EmployeeAttendance[]; month: string }) {
  return (
    <div className={tableStyles.scroller}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col" className={tableStyles.numeric}>Working days</th>
            <th scope="col" className={tableStyles.numeric}>Present</th>
            <th scope="col" className={tableStyles.numeric}>Half days</th>
            <th scope="col" className={tableStyles.numeric}>From home</th>
            <th scope="col" className={tableStyles.numeric}>Late</th>
            <th scope="col" className={tableStyles.numeric}>Left early</th>
            <th scope="col" className={tableStyles.numeric}>On leave</th>
            <th scope="col" className={tableStyles.numeric}>Absent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employeeId}>
              <PersonCell row={row} month={month} />
              <td className={tableStyles.numeric}>{row.workingDays}</td>
              <td className={tableStyles.numeric}>{row.present}</td>
              <td className={tableStyles.numeric}>{row.halfDays}</td>
              <td className={tableStyles.numeric}>{row.wfhDays}</td>
              <td className={tableStyles.numeric}>{row.late}</td>
              <td className={tableStyles.numeric}>{row.earlyDepartures}</td>
              <td className={tableStyles.numeric}>{row.leaveDays}</td>
              <td className={tableStyles.numeric}>{row.absent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkingHoursTable({ rows, month, overtimeIsSet }: { rows: EmployeeAttendance[]; month: string; overtimeIsSet: boolean }) {
  return (
    <div className={tableStyles.scroller}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col" className={tableStyles.numeric}>Days worked</th>
            <th scope="col" className={tableStyles.numeric}>Hours worked</th>
            <th scope="col" className={tableStyles.numeric}>Average a day</th>
            <th scope="col" className={tableStyles.numeric}>Breaks</th>
            <th scope="col" className={tableStyles.numeric}>{overtimeIsSet ? 'Overtime' : 'Overtime (not set up)'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const daysWorked = row.details.filter((day) => day.workedMinutes > 0).length;
            return (
              <tr key={row.employeeId}>
                <PersonCell row={row} month={month} />
                <td className={tableStyles.numeric}>{daysWorked}</td>
                <td className={tableStyles.numeric}>{hours(row.workedMinutes)}</td>
                <td className={tableStyles.numeric}>{daysWorked > 0 ? formatWorkedTime(Math.round(row.workedMinutes / daysWorked)) : '—'}</td>
                <td className={tableStyles.numeric}>{hours(row.breakMinutes)}</td>
                <td className={tableStyles.numeric}>{overtimeIsSet ? hours(row.overtimeMinutes) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type DayEvent = { row: EmployeeAttendance; day: AttendanceDay };

// Late arrivals or early departures, one row per day.
export function AttendanceEventsTable({ events, kind, month }: { events: DayEvent[]; kind: 'late' | 'early'; month: string }) {
  return (
    <div className={tableStyles.scroller}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Date</th>
            <th scope="col">{kind === 'late' ? 'Checked in' : 'Checked out'}</th>
            <th scope="col" className={tableStyles.numeric}>{kind === 'late' ? 'Late by' : 'Left early by'}</th>
            <th scope="col">Where</th>
          </tr>
        </thead>
        <tbody>
          {events.map(({ row, day }) => (
            <tr key={`${row.employeeId}-${day.date}`}>
              <PersonCell row={row} month={month} />
              <td>{formatDate(day.date)}</td>
              <td>{kind === 'late' ? (day.checkIn ? indiaClock(day.checkIn) : '—') : day.checkOut ? indiaClock(day.checkOut) : '—'}</td>
              <td className={tableStyles.numeric}>{formatWorkedTime(kind === 'late' ? day.lateMinutes : day.earlyMinutes)}</td>
              <td>{day.workMode === 'wfh' ? 'From home' : 'Office'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const statusTone: Partial<Record<DayStatus, 'good' | 'warning' | 'critical'>> = {
  present: 'good',
  half_day: 'warning',
  absent: 'critical',
};

// Every day of the month for one person.
export function EmployeeDaysTable({ row }: { row: EmployeeAttendance }) {
  return (
    <div className={tableStyles.scroller}>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Status</th>
            <th scope="col">In</th>
            <th scope="col">Out</th>
            <th scope="col" className={tableStyles.numeric}>Breaks</th>
            <th scope="col" className={tableStyles.numeric}>Worked</th>
            <th scope="col" className={tableStyles.numeric}>Overtime</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {row.details.map((day) => (
            <tr key={day.date}>
              <td>{formatDate(day.date)}</td>
              <td>
                <StatusBadge tone={statusTone[day.status]}>{dayStatusLabels[day.status]}</StatusBadge>
              </td>
              <td>{day.checkIn ? indiaClock(day.checkIn) : '—'}</td>
              <td>{day.checkOut ? indiaClock(day.checkOut) : '—'}</td>
              <td className={tableStyles.numeric}>{hours(day.breakMinutes)}</td>
              <td className={tableStyles.numeric}>{hours(day.workedMinutes)}</td>
              <td className={tableStyles.numeric}>{hours(day.overtimeMinutes)}</td>
              <td className={tableStyles.secondaryText}>
                {[
                  day.workMode === 'wfh' && 'From home',
                  day.lateMinutes > 0 && `Late by ${formatWorkedTime(day.lateMinutes)}`,
                  day.earlyMinutes > 0 && `Left ${formatWorkedTime(day.earlyMinutes)} early`,
                  day.isOverridden && 'Status set by HR',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const gridCodes: Record<DayStatus, string> = {
  present: 'P',
  half_day: '½',
  absent: 'A',
  leave: 'L',
  holiday: 'H',
  week_off: 'W',
  upcoming: '·',
};

// The month at a glance: one row per person, one column per day.
export function MonthlyAttendanceGrid({ rows, dates, month }: { rows: EmployeeAttendance[]; dates: string[]; month: string }) {
  return (
    <>
      <ul className={styles.legend} aria-label="Key">
        {(Object.keys(gridCodes) as DayStatus[]).map((status) => (
          <li key={status}>
            <span className={styles.cell} data-status={status}>
              {gridCodes[status]}
            </span>
            {dayStatusLabels[status]}
          </li>
        ))}
      </ul>
      <div className={tableStyles.scroller}>
        <table className={`${tableStyles.table} ${styles.grid}`}>
          <thead>
            <tr>
              <th scope="col">Employee</th>
              {dates.map((date) => (
                <th key={date} scope="col" className={styles.dayHeading}>
                  {Number(date.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId}>
                <PersonCell row={row} month={month} />
                {dates.map((date) => {
                  const status = row.days[date] ?? 'upcoming';
                  return (
                    <td key={date} className={styles.dayCell}>
                      <span className={styles.cell} data-status={status} title={`${formatDate(date)}: ${dayStatusLabels[status]}`}>
                        {gridCodes[status]}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
