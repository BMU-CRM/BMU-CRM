'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { editMessageSchema, groupConversationSchema, messageSchema } from '@/lib/validation/messageSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

export async function sendMessageAction(
  conversationId: string,
  message: { body: string; replyToId?: string | null; fileId?: string | null },
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const parsed = messageSchema.safeParse({
    body: message.body,
    replyToId: message.replyToId ?? '',
    fileId: message.fileId ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('messages').insert({
    conversation_id: conversationId,
    body: parsed.data.body,
    reply_to_id: parsed.data.replyToId,
    file_id: parsed.data.fileId,
  });

  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  return success('Sent.');
}

export async function editMessageAction(conversationId: string, messageId: string, body: string): Promise<ActionResult> {
  const parsed = editMessageSchema.safeParse({ body });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('messages')
    .update({ body: parsed.data.body })
    .eq('id', messageId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/messages/${conversationId}`);
  return success('Message updated.');
}

export async function deleteMessageAction(conversationId: string, messageId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/messages/${conversationId}`);
  return success('Message deleted.');
}

export async function setMessagePinnedAction(
  conversationId: string,
  messageId: string,
  isPinned: boolean,
): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('messages')
    .update({ pinned_at: isPinned ? new Date().toISOString() : null })
    .eq('id', messageId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/messages/${conversationId}`);
  return success(isPinned ? 'Message pinned.' : 'Message unpinned.');
}

export async function startDirectConversationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const other = z.uuid().safeParse(formData.get('employeeId'));
  if (!other.success) return { status: 'error', message: 'Choose someone to message.', fieldErrors: { employeeId: 'Choose someone.' } };

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_or_create_direct_conversation', { p_other: other.data });
  if (error) return databaseFailure(error);

  redirect(`/messages/${data}`);
}

export async function createGroupConversationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const parsed = groupConversationSchema.safeParse({
    title: formData.get('title'),
    memberIds: formData.getAll('memberIds'),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('create_group_conversation', {
    p_title: parsed.data.title,
    p_members: parsed.data.memberIds,
  });
  if (error) return databaseFailure(error);

  revalidatePath('/messages');
  redirect(`/messages/${data}`);
}
