import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { conversationTitle } from '@/lib/messages/conversationTitle';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { clientLabelFor } from './clientService';

export const messagesPerPage = 60;

export async function listMyConversations() {
  const database = await createDatabaseClient();

  const { data, error } = await database.rpc('get_my_conversations');
  if (error) throw error;

  return data.map((conversation) => ({ ...conversation, displayTitle: conversationTitle(conversation) }));
}

export type ConversationSummary = Awaited<ReturnType<typeof listMyConversations>>[number];

export async function getConversation(conversationId: string, myEmployeeId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('conversations')
    .select(
      `id, kind, title, project_id, client_id,
       department:departments(name),
       project:projects(name),
       client:clients(company_name),
       members:conversation_members(employee:employees(id, full_name))`,
    )
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const members = data.members.flatMap((member) => (member.employee ? [member.employee] : []));
  const other = members.find((member) => member.id !== myEmployeeId);

  const [canPost] = await Promise.all([database.rpc('can_post_in_conversation', { p_conversation: conversationId })]);

  return {
    ...data,
    members,
    canPost: canPost.data === true,
    displayTitle: conversationTitle({
      kind: data.kind,
      title: data.title,
      department_name: data.department?.name ?? null,
      project_name: data.project?.name ?? null,
      client_name: data.client?.company_name ?? (await clientLabelFor(data.client_id))?.company_name ?? null,
      other_person_name: other?.full_name ?? null,
    }),
  };
}

export type ConversationDetails = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

const messageFields = `
  id, body, created_at, edited_at, deleted_at, pinned_at, author_id, reply_to_id, file_id,
  author:employees!messages_author_id_fkey(id, full_name),
  file:files(id, name, kind, size_bytes, status),
  reply:reply_to_id(id, body, deleted_at, author:employees!messages_author_id_fkey(full_name))
`;

export async function listMessages(conversationId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('messages')
    .select(messageFields)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(messagesPerPage);

  if (error) throw error;
  return data.reverse();
}

export type MessageItem = Awaited<ReturnType<typeof listMessages>>[number];

export async function listPinnedMessages(conversationId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('messages')
    .select('id, body, author:employees!messages_author_id_fkey(full_name)')
    .eq('conversation_id', conversationId)
    .not('pinned_at', 'is', null)
    .order('pinned_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data;
}

export async function listReadPositions(conversationId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('conversation_reads')
    .select('employee_id, last_read_at, employee:employees(full_name)')
    .eq('conversation_id', conversationId);

  if (error) throw error;
  return data;
}

export async function markConversationRead(conversationId: string) {
  const database = await createDatabaseClient();
  await database.rpc('mark_conversation_read', { p_conversation: conversationId });
}

export async function searchMessages(search: string) {
  const term = cleanSearchTerm(search);
  if (!term) return [];

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('messages')
    .select('id, body, created_at, conversation_id, author:employees!messages_author_id_fkey(full_name)')
    .is('deleted_at', null)
    .ilike('body', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data;
}

export async function findLinkedConversationId(link: { projectId?: string; clientId?: string }) {
  const database = await createDatabaseClient();

  let query = database.from('conversations').select('id');
  if (link.projectId) query = query.eq('project_id', link.projectId);
  if (link.clientId) query = query.eq('client_id', link.clientId);

  const { data } = await query.maybeSingle();
  return data?.id ?? null;
}
