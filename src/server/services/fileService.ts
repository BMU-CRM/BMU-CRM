import 'server-only';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { createDatabaseClient } from '@/server/database/databaseClient';
import type { FileLinks } from '@/lib/validation/fileSchema';
import type { CurrentAccess } from './accessService';
import { clientLabelFor } from './clientService';

export const filesPerPage = 30;

export const fileSections = [
  'mine',
  'received',
  'sent',
  'client',
  'department',
  'project',
  'links',
  'archived',
] as const;
export type FileSection = (typeof fileSections)[number];

const fileFields = `
  id, kind, status, name, description, mime_type, size_bytes, external_url, current_version,
  owner_id, client_id, project_id, task_id, is_archived, created_at, updated_at,
  owner:employees!files_owner_id_fkey(id, full_name),
  department:departments(name),
  project:projects(id, name),
  task:tasks(id, title)
`;

export type FileFilters = { section: FileSection; search?: string; page: number };

// Received and sent files are listed by share, so each row shows who sent it and when.
async function listShares(access: CurrentAccess, section: 'received' | 'sent' | 'department', search: string, page: number) {
  const database = await createDatabaseClient();
  const from = (page - 1) * filesPerPage;
  const me = access.employee.id;

  let query = database
    .from('file_shares')
    .select(
      `id, note, expires_at, created_at, sender_name, sender_designation, sender_department,
       recipient:employees!file_shares_recipient_employee_id_fkey(full_name),
       recipientDepartment:departments(name),
       file:files!inner(id, name, kind, size_bytes, is_archived, status)`,
      { count: 'exact' },
    )
    .eq('file.is_archived', false)
    .eq('file.status', 'ready')
    .order('created_at', { ascending: false })
    .range(from, from + filesPerPage - 1);

  if (section === 'sent') query = query.eq('shared_by', me);
  if (section === 'received') query = query.eq('recipient_employee_id', me);
  if (section === 'department') {
    query = access.employee.department_id
      ? query.eq('recipient_department_id', access.employee.department_id)
      : query.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  if (search) query = query.ilike('file.name', `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw error;
  return { shares: data, total: count ?? 0 };
}

export async function listFiles(access: CurrentAccess, { section, search, page }: FileFilters) {
  const term = search ? cleanSearchTerm(search) : '';

  if (section === 'received' || section === 'sent' || section === 'department') {
    return { kind: 'shares' as const, ...(await listShares(access, section, term, page)) };
  }

  const database = await createDatabaseClient();
  const from = (page - 1) * filesPerPage;

  let query = database
    .from('files')
    .select(fileFields, { count: 'exact' })
    .eq('status', 'ready')
    // Employee documents live on the employee's record, not in Files.
    .is('employee_id', null)
    .eq('is_archived', section === 'archived')
    .order('created_at', { ascending: false })
    .range(from, from + filesPerPage - 1);

  if (section === 'mine' || section === 'archived') query = query.eq('owner_id', access.employee.id);
  if (section === 'client') query = query.not('client_id', 'is', null);
  if (section === 'project') query = query.not('project_id', 'is', null);
  if (section === 'links') query = query.eq('kind', 'link');
  if (term) query = query.ilike('name', `%${term}%`);

  const { data, count, error } = await query;
  if (error) throw error;
  return { kind: 'files' as const, files: data, total: count ?? 0 };
}

export type FileListItem = Extract<Awaited<ReturnType<typeof listFiles>>, { kind: 'files' }>['files'][number];
export type ShareListItem = Extract<Awaited<ReturnType<typeof listFiles>>, { kind: 'shares' }>['shares'][number];

export async function listLinkedFiles(link: FileLinks) {
  const database = await createDatabaseClient();

  let query = database
    .from('files')
    .select(fileFields)
    .eq('status', 'ready')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (link.taskId) query = query.eq('task_id', link.taskId);
  if (link.projectId) query = query.eq('project_id', link.projectId);
  if (link.clientId) query = query.eq('client_id', link.clientId);
  if (link.meetingId) query = query.eq('meeting_id', link.meetingId);
  if (link.ticketId) query = query.eq('ticket_id', link.ticketId);
  query = link.employeeId ? query.eq('employee_id', link.employeeId) : query.is('employee_id', null);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getFile(fileId: string) {
  const database = await createDatabaseClient();

  const { data, error } = await database
    .from('files')
    .select(`${fileFields}, client:clients(id, company_name)`)
    .eq('id', fileId)
    .eq('status', 'ready')
    .maybeSingle();

  if (error) throw error;
  return data && { ...data, client: data.client ?? (await clientLabelFor(data.client_id)) };
}

export type FileDetails = NonNullable<Awaited<ReturnType<typeof getFile>>>;

export async function loadFilePanels(fileId: string, isOwner: boolean) {
  const database = await createDatabaseClient();

  const [versions, shares, comments, accessLog] = await Promise.all([
    database
      .from('file_versions')
      .select('id, version, original_name, size_bytes, uploaded_at, uploader:employees(full_name)')
      .eq('file_id', fileId)
      .not('uploaded_at', 'is', null)
      .order('version', { ascending: false }),
    database
      .from('file_shares')
      .select(
        `id, note, expires_at, created_at, sender_name, sender_designation, sender_department,
         recipient:employees!file_shares_recipient_employee_id_fkey(full_name),
         recipientDepartment:departments(name)`,
      )
      .eq('file_id', fileId)
      .order('created_at', { ascending: false }),
    database
      .from('file_comments')
      .select('id, body, created_at, author:employees(full_name)')
      .eq('file_id', fileId)
      .order('created_at'),
    isOwner
      ? database
          .from('file_access_logs')
          .select('id, employee_name, action, version, created_at')
          .eq('file_id', fileId)
          .order('id', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [versions, shares, comments, accessLog]) {
    if (result.error) throw result.error;
  }

  return {
    versions: versions.data ?? [],
    shares: shares.data ?? [],
    comments: comments.data ?? [],
    accessLog: accessLog.data ?? [],
  };
}

export async function listRecentlyReceived(access: CurrentAccess, limit: number) {
  const { shares } = await listShares(access, 'received', '', 1);
  return shares.slice(0, limit);
}
