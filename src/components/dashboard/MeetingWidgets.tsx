import { AppLink as Link } from '@/components/ui/AppLink';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { indiaClock } from '@/lib/attendance/summariseAttendance';
import { datePartInIndia } from '@/lib/calendar/calendarRange';
import { formatDate } from '@/lib/formatDate';
import type { CurrentAccess } from '@/server/services/accessService';
import { listUpcomingMeetings } from '@/server/services/meetingService';

export async function UpcomingMeetingsWidget({ access }: { access: CurrentAccess }) {
  const meetings = await listUpcomingMeetings(access, 5);

  return (
    <Panel title="Upcoming meetings" action={<ButtonLink href="/calendar" variant="ghost">Calendar</ButtonLink>} flush>
      {meetings.length === 0 ? (
        <p className={layout.emptyText}>No meetings coming up.</p>
      ) : (
        <ul className={layout.list}>
          {meetings.map((meeting) => (
            <li key={meeting.id} className={layout.row}>
              <div className={layout.rowMain}>
                <Link href={`/meetings/${meeting.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                  {meeting.title}
                </Link>
                <p className={layout.muted}>
                  {formatDate(datePartInIndia(meeting.starts_at))}, {indiaClock(meeting.starts_at)} to {indiaClock(meeting.ends_at)}
                  {meeting.location ? ` · ${meeting.location}` : meeting.meeting_link ? ' · Online' : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
