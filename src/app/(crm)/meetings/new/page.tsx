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
import { listCalendarCategories } from '@/server/services/meetingService';
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

  const plansContent = access.permissions[permissionKeys.contentCalendarManage] !== undefined;
  const [people, clients, projects, categories] = await Promise.all([
    listEmployeeOptions(),
    listClientOptions(access),
    listProjectOptions(),
    plansContent ? listCalendarCategories() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={plansContent ? 'New calendar entry' : 'New meeting'}
        description="Everyone invited is notified, and reminded 15 minutes before it starts. Content work under a category goes to that category's people."
      />
      <Panel>
        <MeetingForm
          defaultDate={date}
          defaultClientId={clients.some((client) => client.id === clientId) ? clientId : undefined}
          people={people.filter((person) => person.id !== access.employee.id).map((person) => ({ value: person.id, label: person.full_name }))}
          clients={clients.map((client) => ({ value: client.id, label: client.company_name }))}
          projects={projects.map((project) => ({ value: project.id, label: project.name }))}
          categories={categories
            ?.filter((category) => category.is_active)
            .map((category) => ({ value: category.id, label: category.name, people: category.members.map((member) => member.full_name) }))}
        />
      </Panel>
    </>
  );
}
