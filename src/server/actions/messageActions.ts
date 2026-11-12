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

const messageIdsSchema = z.array(z.uuid()).min(1).max(100);

export async function setMessageStarredAction(conversationId: string, messageId: string, starred: boolean): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.messagesUse);
  if (!access) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error } = starred
    ? await database.from('message_stars').upsert({ message_id: messageId, employee_id: access.employee.id }).select('message_id')
    : await database.from('message_stars').delete().eq('message_id', messageId).select('message_id');
  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath('/messages/starred');
  return success(starred ? 'Starred.' : 'Unstarred.');
}

// Delete for me: the messages disappear from this person's view only.
export async function hideMessagesAction(conversationId: string, messageIds: string[]): Promise<ActionResult> {
  const access = await getActionAccess(permissionKeys.messagesUse);
  if (!access) return failure(noPermission);
  const parsed = messageIdsSchema.safeParse(messageIds);
  if (!parsed.success) return failure('Choose the messages to delete.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('message_hidden')
    .upsert(parsed.data.map((message_id) => ({ message_id, employee_id: access.employee.id })))
    .select('message_id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/messages/${conversationId}`);
  return success(parsed.data.length === 1 ? 'Deleted for you.' : `${parsed.data.length} messages deleted for you.`);
}

// Delete for everyone: within five minutes of sending, as the database enforces.
export async function deleteMessagesForEveryoneAction(conversationId: string, messageIds: string[]): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);
  const parsed = messageIdsSchema.safeParse(messageIds);
  if (!parsed.success) return failure('Choose the messages to delete.');

  const database = await createDatabaseClient();
  for (const messageId of parsed.data) {
    const { data, error } = await database
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .select('id');
    if (error) return databaseFailure(error);
    if (data.length === 0) return failure(noPermission);
  }

  revalidatePath(`/messages/${conversationId}`);
  return success('Deleted for everyone.');
}

// Sends copies of messages to other conversations, marked as forwarded. Polls are not
// forwarded, because their votes belong to the original conversation.
export async function forwardMessagesAction(messageIds: string[], conversationIds: string[]): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);
  const messages = messageIdsSchema.safeParse(messageIds);
  const targets = z.array(z.uuid()).min(1, 'Choose where to forward.').max(20).safeParse(conversationIds);
  if (!messages.success) return failure('Choose the messages to forward.');
  if (!targets.success) return failure('Choose at least one conversation.');

  const database = await createDatabaseClient();
  const { data: originals, error } = await database
    .from('messages')
    .select('id, body, file_id, contact_employee_id, meeting_id, poll_question, deleted_at, created_at')
    .in('id', messages.data)
    .order('created_at');
  if (error) return databaseFailure(error);

  const sendable = originals.filter((message) => !message.deleted_at && !message.poll_question);
  if (sendable.length === 0) return failure('These messages cannot be forwarded.');

  for (const conversationId of targets.data) {
    const { error: insertError } = await database.from('messages').insert(
      sendable.map((message) => ({
        conversation_id: conversationId,
        body: message.body,
        file_id: message.file_id,
        contact_employee_id: message.contact_employee_id,
        meeting_id: message.meeting_id,
        forwarded: true,
      })),
    );
    if (insertError) return databaseFailure(insertError);
    revalidatePath(`/messages/${conversationId}`);
  }

  revalidatePath('/messages', 'layout');
  return success(`Forwarded to ${targets.data.length} ${targets.data.length === 1 ? 'conversation' : 'conversations'}.`);
}

// Clear chat: every message so far disappears from your own view only.
export async function clearChatAction(conversationId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('clear_conversation_for_me', { p_conversation: conversationId });
  if (error) return databaseFailure(error);

  revalidatePath(`/messages/${conversationId}`);
  return success('Chat cleared for you.');
}

export async function leaveGroupAction(conversationId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('leave_group', { p_conversation: conversationId });
  if (error) return databaseFailure(error);

  revalidatePath('/messages', 'layout');
  redirect('/messages');
}

export async function renameGroupAction(conversationId: string, title: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);
  const parsed = z.string().trim().min(1, 'Name the group.').max(120, 'Use 120 characters or fewer.').safeParse(title);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Name the group.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('conversations')
    .update({ title: parsed.data })
    .eq('id', conversationId)
    .select('id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('Only group admins can rename the group.');

  revalidatePath('/messages', 'layout');
  return success('Group renamed.');
}

export async function addGroupMembersAction(conversationId: string, employeeIds: string[]): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);
  const parsed = z.array(z.uuid()).min(1, 'Choose at least one person.').max(100).safeParse(employeeIds);
  if (!parsed.success) return failure('Choose at least one person.');

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('conversation_members')
    .insert(parsed.data.map((employee_id) => ({ conversation_id: conversationId, employee_id })))
    .select('employee_id');
  if (error) return databaseFailure(error, 'They are already in the group.');
  if (data.length === 0) return failure('Only group admins can add people.');

  revalidatePath(`/messages/${conversationId}`);
  return success(`${data.length} added.`);
}

export async function removeGroupMemberAction(conversationId: string, employeeId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('employee_id', employeeId)
    .select('employee_id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure('Only group admins can remove people.');

  revalidatePath(`/messages/${conversationId}`);
  return success('Removed from the group.');
}

export type MessageInfoRow = { employeeId: string; name: string; readAt: string | null; delivered: boolean; deliveredAt: string | null };

// Who your message reached and who read it.
export async function getMessageInfoAction(messageId: string): Promise<MessageInfoRow[]> {
  if (!(await getActionAccess(permissionKeys.messagesUse))) return [];
  const parsed = z.uuid().safeParse(messageId);
  if (!parsed.success) return [];

  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_message_info', { p_message: parsed.data });
  if (error) return [];
  return data.map((row) => ({
    employeeId: row.employee_id,
    name: row.full_name,
    readAt: row.read_at,
    delivered: row.delivered,
    deliveredAt: row.delivered_at,
  }));
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
