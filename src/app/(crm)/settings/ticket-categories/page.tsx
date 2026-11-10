import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TicketCategoryForm } from '@/components/tickets/TicketForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { listDepartmentOptions, listTicketCategories } from '@/server/services/ticketService';

export const metadata: Metadata = { title: 'Ticket categories' };

export default async function TicketCategoriesPage() {
  const access = await requirePagePermission(permissionKeys.ticketsManage);
  // Categories decide where every ticket goes, so only company-wide handlers change them.
  if (access.permissions[permissionKeys.ticketsManage] !== 'organisation') notFound();

  const [categories, departments, people] = await Promise.all([
    listTicketCategories({ includeInactive: true }),
    listDepartmentOptions(),
    listEmployeeOptions(),
  ]);

  const departmentOptions = departments.map((department) => ({ value: department.id, label: department.name }));
  const peopleOptions = people.map((person) => ({ value: person.id, label: person.full_name }));

  return (
    <>
      <PageHeader
        title="Ticket categories"
        description="Each category sends tickets to a department. Choose a person to send them straight to someone; otherwise the department head is told."
      />
      <Panel flush>
        <ul className={layout.list}>
          {categories.map((category) => (
            <li key={category.id} className={layout.sectionForm}>
              <TicketCategoryForm category={category} departments={departmentOptions} people={peopleOptions} />
            </li>
          ))}
          <li className={layout.sectionForm}>
            <p className={`${layout.rowTitle} ${layout.muted}`}>Add a category</p>
            <TicketCategoryForm departments={departmentOptions} people={peopleOptions} />
          </li>
        </ul>
      </Panel>
    </>
  );
}
