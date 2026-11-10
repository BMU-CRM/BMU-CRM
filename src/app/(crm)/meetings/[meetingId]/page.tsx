import { CalendarPlus, Pencil, Video } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LinkedFilesPanel } from '@/components/files/LinkedFilesPanel';
import { MeetingNotesForm } from '@/components/meetings/MeetingForms';
import { TaskStatusBadge } from '@/components/tasks/TaskBadges';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { indiaClock } from '@/lib/attendance/summariseAttendance';
import { datePartInIndia } from '@/lib/calendar/calendarRange';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { safeExternalUrl } from '@/lib/safeExternalUrl';
import { meetingKindLabels } from '@/lib/validation/meetingSchema';
import { respondToMeetingAction, setMeetingStatusAction } from '@/server/actions/meetingActions';
import { requirePagePermission } from '@/server/services/accessService';
import { listLinkedFiles } from '@/server/services/fileService';
import { getMeeting, listMeetingFollowUps } from '@/server/services/meetingService';

export const metadata: Metadata = { title: 'Meeting' };

const responseLabels = { pending: 'Not answered', accepted: 'Going', declined: 'Not going' } as const;
const responseTones = { pending: 'neutral', accepted: 'good', declined: 'critical' } as const;

type MeetingPageProps = {
  params: Promise<{ meetingId: string }>;
};

export default async function MeetingPage({ params }: MeetingPageProps) {
  const access = await requirePagePermission(permissionKeys.meetingsCreate);
  const meetingId = parseId((await params).meetingId);
  if (!meetingId) notFound();

  const meeting = await getMeeting(meetingId);
  if (!meeting) notFound();

  const [followUps, files] = await Promise.all([listMeetingFollowUps(meetingId), listLinkedFiles({ meetingId })]);

  const me = access.employee.id;
  const isOrganizer = meeting.organizer_id === me;
  const myInvite = meeting.participants.find((participant) => participant.employee?.id === me);
  const isInvolved = isOrganizer || Boolean(myInvite);
  const isScheduled = meeting.status === 'scheduled';
  const link = safeExternalUrl(meeting.meeting_link);
  const today = todayInIndia();

  return (
    <>
      <PageHeader
        title={meeting.title}
        description={`${formatDate(datePartInIndia(meeting.starts_at))}, ${indiaClock(meeting.starts_at)} to ${indiaClock(meeting.ends_at)}`}
        actions={
          <>
            {link && isScheduled && (
              <ButtonLink href={link} variant="primary" target="_blank" rel="noopener noreferrer">
                <Video size={16} aria-hidden="true" />
                Join
              </ButtonLink>
            )}
            {myInvite && isScheduled && myInvite.response !== 'accepted' && (
              <ActionButton label="I am going" variant="secondary" action={respondToMeetingAction.bind(null, meeting.id, 'accepted')} />
            )}
            {myInvite && isScheduled && myInvite.response !== 'declined' && (
              <ActionButton label="I cannot go" variant="secondary" action={respondToMeetingAction.bind(null, meeting.id, 'declined')} />
            )}
            {isOrganizer && isScheduled && (
              <>
                <ButtonLink href={`/meetings/${meeting.id}/edit`}>
                  <Pencil size={16} aria-hidden="true" />
                  Edit
                </ButtonLink>
                <ActionButton label="Mark as held" variant="secondary" action={setMeetingStatusAction.bind(null, meeting.id, 'completed')} />
                <ConfirmActionButton
                  label="Cancel meeting"
                  title="Cancel this meeting?"
                  description="Everyone invited is told straight away."
                  confirmLabel="Cancel meeting"
                  action={setMeetingStatusAction.bind(null, meeting.id, 'cancelled')}
                />
              </>
            )}
          </>
        }
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel>
            <div className={layout.badges}>
              <StatusBadge>{meetingKindLabels[meeting.kind]}</StatusBadge>
              {meeting.status === 'cancelled' && <StatusBadge tone="critical">Cancelled</StatusBadge>}
              {meeting.status === 'completed' && <StatusBadge tone="good">Held</StatusBadge>}
            </div>
            {meeting.agenda ? (
              <p className={`${layout.text} ${layout.spaced}`}>{meeting.agenda}</p>
            ) : (
              <p className={`${layout.muted} ${layout.spaced}`}>No agenda yet.</p>
            )}
          </Panel>
          <Panel title="Notes and decisions" description="Everyone in the meeting can add to these.">
            {isInvolved ? (
              <MeetingNotesForm meetingId={meeting.id} notes={meeting.notes} decisions={meeting.decisions} />
            ) : (
              <>
                <p className={layout.text}>{meeting.notes ?? 'No notes yet.'}</p>
                {meeting.decisions && <p className={`${layout.text} ${layout.spaced}`}>{meeting.decisions}</p>}
              </>
            )}
          </Panel>
          <Panel
            title="Follow-up tasks"
            action={
              isInvolved && (
                <ButtonLink href={`/tasks/new?meetingId=${meeting.id}${meeting.project_id ? `&projectId=${meeting.project_id}` : ''}`} variant="ghost">
                  <CalendarPlus size={16} aria-hidden="true" />
                  Add task
                </ButtonLink>
              )
            }
            flush
          >
            {followUps.length === 0 ? (
              <p className={layout.emptyText}>No follow-up tasks yet.</p>
            ) : (
              <ul className={layout.list}>
                {followUps.map((task) => (
                  <li key={task.id} className={layout.row}>
                    <div className={layout.rowMain}>
                      <Link href={`/tasks/${task.id}`} className={`${layout.rowTitle} ${layout.link}`}>
                        {task.title}
                      </Link>
                      <p className={layout.muted}>{task.assignee?.full_name ?? 'Unassigned'}</p>
                    </div>
                    <span className={layout.badges}>
                      <TaskStatusBadge status={task.status} dueDate={task.due_date} today={today} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Organiser</dt>
                <dd>{meeting.organizer?.full_name ?? 'Former employee'}</dd>
              </div>
              <div>
                <dt>Place</dt>
                <dd>{meeting.location ?? (link ? 'Online' : 'Not set')}</dd>
              </div>
              {meeting.client && (
                <div>
                  <dt>Client</dt>
                  <dd>{meeting.client.company_name}</dd>
                </div>
              )}
              {meeting.project && (
                <div>
                  <dt>Project</dt>
                  <dd>
                    <Link href={`/projects/${meeting.project.id}`} className={layout.link}>
                      {meeting.project.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
          <Panel title="People" description={`${meeting.participants.length} invited`} flush>
            <ul className={layout.list}>
              {meeting.participants.map((participant) => (
                <li key={participant.employee?.id} className={layout.row}>
                  <span className={layout.rowMain}>{participant.employee?.full_name ?? 'Former employee'}</span>
                  <StatusBadge tone={responseTones[participant.response]}>{responseLabels[participant.response]}</StatusBadge>
                </li>
              ))}
            </ul>
          </Panel>
          <LinkedFilesPanel
            title="Attachments"
            files={files}
            links={{ meetingId: meeting.id }}
            canUpload={isInvolved && access.permissions[permissionKeys.filesUpload] !== undefined}
          />
        </div>
      </div>
    </>
  );
}
