import type { Metadata } from 'next';
import { RaiseTicketForm } from '@/components/tickets/TicketForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listTicketCategories } from '@/server/services/ticketService';

export const metadata: Metadata = { title: 'Raise a ticket' };

export default async function NewTicketPage() {
  await requirePagePermission(permissionKeys.ticketsCreate);
  const categories = await listTicketCategories();

  return (
    <>
      <PageHeader title="Raise a ticket" description="It goes to the team that handles this kind of request, and you are told as it moves along." />
      <Panel>
        <RaiseTicketForm
          categories={categories.map((category) => ({ value: category.id, label: category.name, description: category.description }))}
        />
      </Panel>
    </>
  );
}
