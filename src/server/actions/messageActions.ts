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
import { indiaDateTime } from '@/lib/calendar/calendarRange';
import {
  chatEventSchema,
  chatLinkSchema,
  editMessageSchema,
  groupConversationSchema,
  messageSchema,
  pollSchema,
} from '@/lib/validation/messageSchema';
import { getActionAccess } from '@/server/services/accessService';

const noPermission = 'You do not have permission to do this.';

export async function sendMessageAction(
  conversationId: string,
  message: { body: string; replyToId?: string | null; fileId?: string | null; contactEmployeeId?: string | null },
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const parsed = messageSchema.safeParse({
    body: message.body,
    replyToId: message.replyToId ?? '',
    fileId: message.fileId ?? '',
    contactEmployeeId: message.contactEmployeeId ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('messages').insert({
    conversation_id: conversationId,
    body: parsed.data.body,
    reply_to_id: parsed.data.replyToId,
    file_id: parsed.data.fileId,
    contact_employee_id: parsed.data.contactEmployeeId,
  });

  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  return success('Sent.');
}

// A Google Drive or other link, kept in Files like any shared link and sent into the chat.
export async function sendLinkMessageAction(
  conversationId: string,
  link: { name: string; url: string; note: string },
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);
  if (!(await getActionAccess(permissionKeys.filesUpload))) return failure('You do not have permission to share links.');

  const parsed = chatLinkSchema.safeParse(link);
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const name = parsed.data.name || new URL(parsed.data.url).hostname.replace(/^www\./, '');
  const { data: file, error: fileError } = await database
    .from('files')
    .insert({ kind: 'link', name, external_url: parsed.data.url })
    .select('id')
    .single();
  if (fileError) return databaseFailure(fileError);

  const { error } = await database
    .from('messages')
    .insert({ conversation_id: conversationId, body: parsed.data.note, file_id: file.id });
  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/files', 'layout');
  return success('Link sent.');
}

export async function sendPollAction(
  conversationId: string,
  poll: { question: string; options: string[]; allowsMultiple: boolean },
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const parsed = pollSchema.safeParse(poll);
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('messages').insert({
    conversation_id: conversationId,
    poll_question: parsed.data.question,
    poll_options: parsed.data.options,
    poll_allows_multiple: parsed.data.allowsMultiple,
  });
  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  return success('Poll sent.');
}

export async function votePollAction(conversationId: string, messageId: string, options: number[]): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const parsed = z.array(z.number().int().min(0).max(11)).max(12).safeParse(options);
  if (!parsed.success) return failure('Choose one of the poll options.');

  const database = await createDatabaseClient();
  const { error } = await database.rpc('vote_in_poll', { p_message: messageId, p_options: parsed.data });
  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  return success('Vote saved.');
}

// Schedules a meeting with everyone in the conversation and posts it there.
export async function scheduleChatEventAction(
  conversationId: string,
  event: { title: string; date: string; startTime: string; endTime: string; meetingLink: string },
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.meetingsCreate))) return failure('You do not have permission to schedule meetings.');

  const parsed = chatEventSchema.safeParse(event);
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('post_conversation_event', {
    p_conversation: conversationId,
    p_title: parsed.data.title,
    p_starts_at: indiaDateTime(parsed.data.date, parsed.data.startTime),
    p_ends_at: indiaDateTime(parsed.data.date, parsed.data.endTime),
    p_meeting_link: parsed.data.meetingLink ?? '',
  });
  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/calendar');
  return success('Event scheduled. Everyone here is invited.');
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
