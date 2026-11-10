'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import {
  ticketCategorySchema,
  ticketCommentSchema,
  ticketHandlingSchema,
  ticketResolutionSchema,
  ticketSchema,
  type TicketStatus,
} from '@/lib/validation/ticketSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

function refreshTicket(ticketId: string) {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath('/tickets');
}

export async function raiseTicketAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.ticketsCreate))) return failure(noPermission);

  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    priority: formData.get('priority'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  // Who handles it, and its starting status, are set by the database from the category.
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tickets')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category_id: parsed.data.categoryId,
      priority: parsed.data.priority,
    })
    .select('id')
    .single();

  if (error) return databaseFailure(error);

  revalidatePath('/tickets');
  redirect(`/tickets/${data.id}`);
}

export async function saveTicketHandlingAction(ticketId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = ticketHandlingSchema.safeParse({
    assignedTo: formData.get('assignedTo') ?? '',
    priority: formData.get('priority'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('tickets')
    .update({ assigned_to: parsed.data.assignedTo, priority: parsed.data.priority })
    .eq('id', ticketId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshTicket(ticketId);
  return success('Saved.');
}

export async function changeTicketStatusAction(
  ticketId: string,
  status: TicketStatus,
  resolution?: string,
): Promise<ActionResult> {
  const update: { status: TicketStatus; resolution?: string } = { status };

  if (status === 'resolved') {
    const parsed = ticketResolutionSchema.safeParse(resolution ?? '');
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Describe how the ticket was resolved.');
    update.resolution = parsed.data;
  }

  const database = await createDatabaseClient();
  const { data, error } = await database.from('tickets').update(update).eq('id', ticketId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  refreshTicket(ticketId);
  const messages: Record<TicketStatus, string> = {
    open: 'Ticket reopened.',
    assigned: 'Ticket updated.',
    in_progress: 'Work started.',
    waiting_for_response: 'Waiting for a reply from the requester.',
    resolved: 'Ticket resolved. The requester has been told.',
    closed: 'Ticket closed.',
  };
  return success(messages[status]);
}

export async function addTicketCommentAction(ticketId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure(noPermission);

  const parsed = ticketCommentSchema.safeParse({ body: formData.get('body') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('ticket_comments').insert({ ticket_id: ticketId, body: parsed.data.body });
  if (error) return databaseFailure(error);

  // A reply from the requester answers the support team's question, so work resumes.
  const { data: ticket } = await database.from('tickets').select('status, requester_id').eq('id', ticketId).maybeSingle();
  if (ticket?.status === 'waiting_for_response' && ticket.requester_id === access.employee.id) {
    await database.from('tickets').update({ status: 'in_progress' }).eq('id', ticketId).select('id');
  }

  refreshTicket(ticketId);
  return success('Reply sent.');
}

export async function saveTicketCategoryAction(
  categoryId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.ticketsManage))) return failure(noPermission);

  const parsed = ticketCategorySchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    handlingDepartmentId: formData.get('handlingDepartmentId') ?? '',
    defaultAssigneeId: formData.get('defaultAssigneeId') ?? '',
    isActive: categoryId ? formData.get('isActive') === 'on' : true,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const row = {
    name: parsed.data.name,
    description: parsed.data.description,
    handling_department_id: parsed.data.handlingDepartmentId,
    default_assignee_id: parsed.data.defaultAssigneeId,
    is_active: parsed.data.isActive,
  };

  const database = await createDatabaseClient();
  const { data, error } = categoryId
    ? await database.from('ticket_categories').update(row).eq('id', categoryId).select('id')
    : await database.from('ticket_categories').insert({ ...row, sort_order: 100 }).select('id');

  if (error) return databaseFailure(error, 'A category with this name already exists.');
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/settings/ticket-categories');
  return success(categoryId ? 'Category saved.' : 'Category added.');
}
