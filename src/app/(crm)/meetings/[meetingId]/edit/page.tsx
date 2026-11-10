import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MeetingForm } from '@/components/meetings/MeetingForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { datePartInIndia } from '@/lib/calendar/calendarRange';
import { indiaClock } from '@/lib/attendance/summariseAttendance';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientOptions } from '@/server/services/clientService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { getMeeting } from '@/server/services/meetingService';
import { listProjectOptions } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'Edit meeting' };

type EditMeetingPageProps = {
  params: Promise<{ meetingId: string }>;
};

export default async function EditMeetingPage({ params }: EditMeetingPageProps) {
  const access = await requirePagePermission(permissionKeys.meetingsCreate);
  const meetingId = parseId((await params).meetingId);
  if (!meetingId) notFound();

  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.organizer_id !== access.employee.id) notFound();

  const [people, clients, projects] = await Promise.all([listEmployeeOptions(), listClientOptions(access, meeting.client_id), listProjectOptions()]);

  return (
    <>
      <PageHeader title={`Edit ${meeting.title}`} description="Changing the time or place tells everyone invited." />
      <Panel>
        <MeetingForm
          meeting={{
            id: meeting.id,
            title: meeting.title,
            agenda: meeting.agenda,
            kind: meeting.kind,
            date: datePartInIndia(meeting.starts_at),
            startTime: indiaClock(meeting.starts_at),
            endTime: indiaClock(meeting.ends_at),
            location: meeting.location,
            meeting_link: meeting.meeting_link,
            client_id: meeting.client_id,
            project_id: meeting.project_id,
            participantIds: meeting.participants.flatMap((participant) => (participant.employee ? [participant.employee.id] : [])),
          }}
          people={people.filter((person) => person.id !== access.employee.id).map((person) => ({ value: person.id, label: person.full_name }))}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          projects={projects.map((project) => ({ value: project.id, label: project.name }))}
        />
      </Panel>
    </>
  );
}
