import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarView, calendarHref } from '@/components/meetings/CalendarView';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import taskTabs from '@/components/tasks/TaskViewTabs.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { calendarRange, calendarViews, isCalendarDate } from '@/lib/calendar/calendarRange';
import { todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getCalendarItems } from '@/server/services/meetingService';
import styles from './CalendarPage.module.css';

export const metadata: Metadata = { title: 'Calendar' };

type CalendarPageProps = {
  searchParams: Promise<{ view?: string; date?: string }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const access = await requirePagePermission(permissionKeys.meetingsCreate);
  const params = await searchParams;
  const today = todayInIndia();

  const view = calendarViews.find((option) => option === params.view) ?? 'month';
  const focus = isCalendarDate(params.date) ? params.date : today;
  const range = calendarRange(view, focus);
  const items = await getCalendarItems(access, range.from, range.to);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Your meetings and task deadlines, with team leave and holidays. Finished work is struck through."
        actions={
          <ButtonLink href={`/meetings/new?date=${view === 'month' ? today : focus}`} variant="primary">
            <Plus size={16} aria-hidden="true" />
            New meeting
          </ButtonLink>
        }
      />
      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <Link href={calendarHref(view, range.previous)} className={styles.arrow} aria-label="Previous">
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <Link href={calendarHref(view, today)} className={styles.today}>
            Today
          </Link>
          <Link href={calendarHref(view, range.next)} className={styles.arrow} aria-label="Next">
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
          <h2 className={styles.title}>{range.title}</h2>
        </div>
        <nav className={`${taskTabs.tabs} ${styles.views}`} aria-label="Calendar views">
          {calendarViews.map((option) => (
            <Link key={option} href={calendarHref(option, focus)} className={taskTabs.tab} aria-current={option === view ? 'page' : undefined}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Link>
          ))}
        </nav>
      </div>
      <CalendarView range={range} items={items} today={today} />
    </>
  );
}
