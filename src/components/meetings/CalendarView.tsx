import Link from 'next/link';
import type { CalendarRange } from '@/lib/calendar/calendarRange';
import { formatDate } from '@/lib/formatDate';
import type { CalendarItem } from '@/server/services/meetingService';
import { CalendarDragArea, TaskMoveButton } from './CalendarTaskMove';
import styles from './CalendarView.module.css';

const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The month grid has room only for the start time; lists show the whole span. A
// person's own open tasks can be dragged to another day.
function ItemLine({ item, fullTime = false }: { item: CalendarItem; fullTime?: boolean }) {
  const content = (
    <>
      {item.time && <span className={styles.time}>{fullTime ? item.time : item.time.split(' ')[0]}</span>}
      <span className={styles.itemTitle}>{item.title}</span>
    </>
  );

  return item.href ? (
    <Link
      href={item.href}
      className={styles.item}
      data-kind={item.kind}
      data-cancelled={item.isCancelled}
      data-done={item.isDone}
      draggable={item.canMove ? true : undefined}
      data-task-id={item.canMove ? item.id : undefined}
      data-date={item.canMove ? item.date : undefined}
      title={item.canMove ? `${item.title}. Drag to another day to move it.` : item.title}
    >
      {content}
    </Link>
  ) : (
    <span className={styles.item} data-kind={item.kind}>
      {content}
    </span>
  );
}

// In lists, each movable task also gets a button to pick its new day, for phones.
function AgendaLine({ item }: { item: CalendarItem }) {
  if (!item.canMove) return <ItemLine item={item} fullTime />;
  return (
    <span className={styles.agendaLine}>
      <ItemLine item={item} fullTime />
      <TaskMoveButton taskId={item.id} date={item.date} title={item.title.replace(/^Due: /, '')} />
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
      <li data-kind="done">Done or ended</li>
    </ul>
  );
}

// The month grid for wide screens, and the same items as an agenda list on phones.
export function CalendarView({ range, items, today }: { range: CalendarRange; items: CalendarItem[]; today: string }) {
  const groups = groupByDate(items);
  const monthPrefix = range.focus.slice(0, 7);

  const agenda = (
    <ol className={styles.agenda}>
      {/* A week lists every day, so a task can be moved to a free one. */}
      {range.days
        .filter((day) => (range.view === 'week' || groups.has(day)) && (range.view !== 'month' || day.startsWith(monthPrefix)))
        .map((day) => (
          <li key={day} className={styles.agendaDay} data-drop-date={day}>
            <p className={styles.agendaDate} data-today={day === today}>
              {formatDate(day)}
            </p>
            <div className={styles.agendaItems}>
              {(groups.get(day) ?? []).map((item) => (
                <AgendaLine key={item.id} item={item} />
              ))}
              {!groups.has(day) && <span className={styles.freeDay}>Nothing scheduled</span>}
            </div>
          </li>
        ))}
      {range.view !== 'week' && !range.days.some((day) => groups.has(day)) && (
        <li className={styles.empty}>Nothing scheduled.</li>
      )}
    </ol>
  );

  return (
    <CalendarDragArea>
      <Legend />
      {items.some((item) => item.canMove) && (
        <p className={styles.hint}>
          To postpone or bring forward one of your tasks, drag it to another day, or use its Move button in the list.
        </p>
      )}
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
                <div
                  key={day}
                  className={styles.cell}
                  data-outside={!day.startsWith(monthPrefix)}
                  data-today={day === today}
                  data-drop-date={day}
                >
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
    </CalendarDragArea>
  );
}

export function calendarHref(view: string, date: string) {
  return `/calendar?view=${view}&date=${date}`;
}
