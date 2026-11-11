import Link from 'next/link';
import { holidayKindLabels } from '@/lib/validation/hrSchema';
import styles from './HolidayCalendar.module.css';

type CalendarHoliday = { id: string; holiday_date: string; name: string; kind: string; description: string | null };

const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// The days of a month laid out Monday first, with empty cells before the 1st.
function monthCells(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ];
}

function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function monthTitle(month: string) {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

type MonthProps = {
  month: string;
  holidays: CalendarHoliday[];
  workingDays: number[];
  today: string;
  canEdit: boolean;
};

// One month, large, with each holiday named on its day. Free days link to adding one.
export function HolidayMonth({ month, holidays, workingDays, today, canEdit }: MonthProps) {
  const byDate = new Map(holidays.map((holiday) => [holiday.holiday_date, holiday]));

  return (
    <div className={styles.month}>
      <div className={styles.weekdays} aria-hidden="true">
        {weekdayNames.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <ol className={styles.days} aria-label={monthTitle(month)}>
        {monthCells(month).map((date, index) => {
          if (!date) return <li key={`blank-${index}`} className={styles.blank} aria-hidden="true" />;
          const holiday = byDate.get(date);
          const isOff = !workingDays.includes(isoWeekday(date));
          return (
            <li key={date} className={styles.day} data-holiday={holiday?.kind} data-off={isOff} data-today={date === today}>
              <span className={styles.number}>{Number(date.slice(8))}</span>
              {holiday ? (
                canEdit ? (
                  <Link href={`/hr/holidays/${holiday.id}/edit`} className={styles.holiday} title={holiday.description ?? undefined}>
                    {holiday.name}
                  </Link>
                ) : (
                  <span className={styles.holiday} title={holiday.description ?? undefined}>
                    {holiday.name}
                  </span>
                )
              ) : (
                <>
                  {isOff && <span className={styles.offLabel}>Week off</span>}
                  {canEdit && (
                    <Link href={`/hr/holidays/new?date=${date}`} className={styles.add} aria-label={`Add a holiday on ${date}`}>
                      +
                    </Link>
                  )}
                </>
              )}
              {holiday && <span className={styles.kind}>{holidayKindLabels[holiday.kind as 'public' | 'company']}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// A whole year as twelve small months, with holidays marked. Each month opens large.
export function HolidayYear({ year, holidays, today }: { year: number; holidays: CalendarHoliday[]; today: string }) {
  const byDate = new Map(holidays.map((holiday) => [holiday.holiday_date, holiday]));

  return (
    <div className={styles.year}>
      {Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`).map((month) => (
        <section key={month} className={styles.miniMonth}>
          <h3 className={styles.miniTitle}>
            <Link href={`/hr/holidays?month=${month}`}>{monthTitle(month)}</Link>
          </h3>
          <div className={styles.miniWeekdays} aria-hidden="true">
            {weekdayNames.map((name) => (
              <span key={name}>{name.slice(0, 1)}</span>
            ))}
          </div>
          <ol className={styles.miniDays}>
            {monthCells(month).map((date, index) => {
              if (!date) return <li key={`blank-${index}`} aria-hidden="true" />;
              const holiday = byDate.get(date);
              return (
                <li
                  key={date}
                  className={styles.miniDay}
                  data-holiday={holiday?.kind}
                  data-today={date === today}
                  title={holiday ? `${holiday.name} (${holidayKindLabels[holiday.kind as 'public' | 'company']})` : undefined}
                >
                  {Number(date.slice(8))}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
