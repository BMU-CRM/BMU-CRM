import Link from 'next/link';
import type { CalendarRange } from '@/lib/calendar/calendarRange';
import { formatDate } from '@/lib/formatDate';
import type { CalendarItem } from '@/server/services/meetingService';
import styles from './CalendarView.module.css';

const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The month grid has room only for the start time; lists show the whole span.
function ItemLine({ item, fullTime = false }: { item: CalendarItem; fullTime?: boolean }) {
  const content = (
    <>
      {item.time && <span className={styles.time}>{fullTime ? item.time : item.time.split(' ')[0]}</span>}
      <span className={styles.itemTitle}>{item.title}</span>
    </>
  );

  return item.href ? (
    <Link href={item.href} className={styles.item} data-kind={item.kind} data-cancelled={item.isCancelled}>
      {content}
    </Link>
  ) : (
    <span className={styles.item} data-kind={item.kind}>
      {content}
    </span>
  );
}

function groupByDate(items: CalendarItem[]) {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return groups;
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="Key">
      <li data-kind="meeting">Meeting</li>
      <li data-kind="task">Task due</li>
      <li data-kind="leave">Team leave</li>
      <li data-kind="holiday">Holiday</li>
    </ul>
  );
}

// The month grid for wide screens, and the same items as an agenda list on phones.
export function CalendarView({ range, items, today }: { range: CalendarRange; items: CalendarItem[]; today: string }) {
  const groups = groupByDate(items);
  const monthPrefix = range.focus.slice(0, 7);

  const agenda = (
    <ol className={styles.agenda}>
      {range.days
        .filter((day) => groups.has(day) && (range.view !== 'month' || day.startsWith(monthPrefix)))
        .map((day) => (
          <li key={day} className={styles.agendaDay}>
            <p className={styles.agendaDate} data-today={day === today}>
              {formatDate(day)}
            </p>
            <div className={styles.agendaItems}>
              {(groups.get(day) ?? []).map((item) => (
                <ItemLine key={item.id} item={item} fullTime />
              ))}
            </div>
          </li>
        ))}
      {!range.days.some((day) => groups.has(day)) && <li className={styles.empty}>Nothing scheduled.</li>}
    </ol>
  );

  return (
    <div>
      <Legend />
      {range.view === 'month' ? (
        <>
          <div className={styles.month}>
            {weekdayNames.map((name) => (
              <div key={name} className={styles.weekday}>
                {name}
              </div>
            ))}
            {range.days.map((day) => {
              const dayItems = groups.get(day) ?? [];
              return (
                <div key={day} className={styles.cell} data-outside={!day.startsWith(monthPrefix)} data-today={day === today}>
                  <Link href={`/calendar?view=day&date=${day}`} className={styles.dayNumber} aria-label={formatDate(day)}>
                    {Number(day.slice(8))}
                  </Link>
                  {dayItems.slice(0, 3).map((item) => (
                    <ItemLine key={item.id} item={item} />
                  ))}
                  {dayItems.length > 3 && (
                    <Link href={`/calendar?view=day&date=${day}`} className={styles.more}>
                      +{dayItems.length - 3} more
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.phoneOnly}>{agenda}</div>
        </>
      ) : (
        agenda
      )}
    </div>
  );
}

export function calendarHref(view: string, date: string) {
  return `/calendar?view=${view}&date=${date}`;
}
