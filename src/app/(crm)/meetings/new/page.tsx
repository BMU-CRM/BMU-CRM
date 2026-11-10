import type { Metadata } from 'next';
import { MeetingForm } from '@/components/meetings/MeetingForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { isCalendarDate } from '@/lib/calendar/calendarRange';
import { todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listClientOptions } from '@/server/services/clientService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listProjectOptions } from '@/server/services/projectService';

export const metadata: Metadata = { title: 'New meeting' };

type NewMeetingPageProps = {
  searchParams: Promise<{ date?: string; clientId?: string }>;
};

export default async function NewMeetingPage({ searchParams }: NewMeetingPageProps) {
  const access = await requirePagePermission(permissionKeys.meetingsCreate);
  const query = await searchParams;
  const date = isCalendarDate(query.date) ? query.date : todayInIndia();
  const clientId = parseId(query.clientId);

  const [people, clients, projects] = await Promise.all([listEmployeeOptions(), listClientOptions(access), listProjectOptions()]);

  return (
    <>
      <PageHeader title="New meeting" description="Everyone invited is notified, and reminded 15 minutes before it starts." />
      <Panel>
        <MeetingForm
          defaultDate={date}
          defaultClientId={clients.some((client) => client.id === clientId) ? clientId : undefined}
          people={people.filter((person) => person.id !== access.employee.id).map((person) => ({ value: person.id, label: person.full_name }))}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          projects={projects.map((project) => ({ value: project.id, label: project.name }))}
        />
      </Panel>
    </>
  );
}
