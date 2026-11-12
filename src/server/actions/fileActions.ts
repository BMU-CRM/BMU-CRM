'use server';

import { revalidatePath } from 'next/cache';
import {
  databaseFailure,
  failure,
  success,
  validationFailure,
  type ActionResult,
} from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import type { EmployeeDocumentType } from '@/lib/employees/employeeRecordLabels';
import { checkUploadable } from '@/lib/files/fileTypes';
import { createDatabaseClient } from '@/server/database/databaseClient';
import {
  driveLinkSchema,
  fileCommentSchema,
  fileDetailsSchema,
  fileShareSchema,
  startUploadSchema,
  type FileLinks,
} from '@/lib/validation/fileSchema';
import { getActionAccess } from '@/server/services/accessService';
import { redirect } from 'next/navigation';
import { createUploadLink, removeStoredFiles } from '@/server/storage/fileStorage';

const noPermission = 'You do not have permission to do this.';

export type UploadTicket = { fileId: string; versionId: string; uploadUrl: string };
type UploadStart = { status: 'ready'; ticket: UploadTicket } | { status: 'error'; message: string };

type UploadRequest = FileLinks & {
  name: string;
  size: number;
  description?: string;
};

function linkFields(links: FileLinks) {
  return {
    clientId: links.clientId ?? '',
    projectId: links.projectId ?? '',
    taskId: links.taskId ?? '',
    meetingId: links.meetingId ?? '',
    ticketId: links.ticketId ?? '',
    employeeId: links.employeeId ?? '',
    candidateId: links.candidateId ?? '',
    documentType: links.documentType ?? '',
  };
}

type ParsedLinks = {
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  meetingId: string | null;
  ticketId: string | null;
  employeeId: string | null;
  candidateId: string | null;
  documentType: EmployeeDocumentType | null;
};

function linkColumns(links: ParsedLinks) {
  return {
    client_id: links.clientId,
    project_id: links.projectId,
    task_id: links.taskId,
    meeting_id: links.meetingId,
    ticket_id: links.ticketId,
    employee_id: links.employeeId,
    candidate_id: links.candidateId,
    document_type: links.documentType,
  };
}

function revalidateLinkedPages(links: FileLinks) {
  if (links.taskId) revalidatePath(`/tasks/${links.taskId}`);
  if (links.meetingId) revalidatePath(`/meetings/${links.meetingId}`);
  if (links.ticketId) revalidatePath(`/tickets/${links.ticketId}`);
  if (links.employeeId) {
    revalidatePath(`/people/employees/${links.employeeId}`);
    revalidatePath('/profile');
  }
}

// Step 1 of an upload: create the file record and a signed link for the browser to
// send the file straight to Storage, without passing through this server.
export async function startUploadAction(request: UploadRequest): Promise<UploadStart> {
  if (!(await getActionAccess(permissionKeys.filesUpload))) return { status: 'error', message: noPermission };

  const problem = checkUploadable(request);
  if (problem) return { status: 'error', message: problem };

  const parsed = startUploadSchema.safeParse({
    name: request.name,
    description: request.description ?? '',
    ...linkFields(request),
  });
  if (!parsed.success) return { status: 'error', message: 'This file could not be prepared.' };

  const database = await createDatabaseClient();
  const { data: file, error } = await database
    .from('files')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      ...linkColumns(parsed.data),
    })
    .select('id')
    .single();

  if (error) return { status: 'error', message: databaseFailure(error).message ?? 'Upload failed.' };

  return startVersion(file.id, parsed.data.name);
}

async function startVersion(fileId: string, name: string): Promise<UploadStart> {
  const database = await createDatabaseClient();

  const { data: version, error } = await database
    .from('file_versions')
    .insert({ file_id: fileId, original_name: name })
    .select('id, storage_path')
    .single();

  if (error) return { status: 'error', message: databaseFailure(error).message ?? 'Upload failed.' };

  try {
    const uploadUrl = await createUploadLink(version.storage_path);
    return { status: 'ready', ticket: { fileId, versionId: version.id, uploadUrl } };
  } catch (uploadError) {
    console.error('Could not create upload link', uploadError);
    return { status: 'error', message: 'The upload could not be started. Please try again.' };
  }
}

export async function startNewVersionAction(fileId: string, request: { name: string; size: number }): Promise<UploadStart> {
  if (!(await getActionAccess(permissionKeys.filesUpload))) return { status: 'error', message: noPermission };

  const problem = checkUploadable(request);
  if (problem) return { status: 'error', message: problem };

  return startVersion(fileId, request.name);
}

// Step 2: the database reads the real size and type from Storage before marking the
// file ready, so nothing the browser claims is trusted.
export async function finishUploadAction(versionId: string): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.filesUpload))) return failure(noPermission);

  const database = await createDatabaseClient();
  const { error } = await database.rpc('finalize_file_version', { p_version: versionId });
  if (error) return databaseFailure(error);

  revalidatePath('/files', 'layout');
  return success('Uploaded.');
}

// Removes a record whose upload failed or was cancelled.
export async function abandonUploadAction(fileId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  await database.from('files').delete().eq('id', fileId).eq('status', 'uploading');
  return success('Cancelled.');
}

export async function addDriveLinkAction(
  links: FileLinks,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.filesUpload))) return failure(noPermission);

  const parsed = driveLinkSchema.safeParse({
    name: formData.get('name'),
    url: formData.get('url'),
    description: formData.get('description') ?? '',
    ...linkFields(links),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('files').insert({
    kind: 'link',
    name: parsed.data.name,
    external_url: parsed.data.url,
    description: parsed.data.description,
    ...linkColumns(parsed.data),
  });

  if (error) return databaseFailure(error);

  revalidatePath('/files', 'layout');
  revalidateLinkedPages(links);
  return success('Link added.');
}

export async function updateFileDetailsAction(
  fileId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = fileDetailsSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('files')
    .update({ name: parsed.data.name, description: parsed.data.description })
    .eq('id', fileId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/files/${fileId}`);
  return success('Saved.');
}

export async function setFileArchivedAction(fileId: string, isArchived: boolean): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('files')
    .update({ is_archived: isArchived })
    .eq('id', fileId)
    .select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/files', 'layout');
  return success(isArchived ? 'File archived.' : 'File restored.');
}

// Deletes a file for good. The database checks who may, and refuses receipts and bills
// on money records; the stored copies go once the record is gone.
export async function deleteFileAction(fileId: string, returnTo?: string): Promise<ActionResult> {
  if (!(await getActionAccess())) return failure(noPermission);
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('delete_file', { p_file: fileId });
  if (error) return databaseFailure(error);

  try {
    await removeStoredFiles(data.map((row) => row.storage_path));
  } catch {
    // The record is gone, so the file can no longer be reached. A copy left in storage
    // only takes space, and is not worth failing the delete for.
  }

  revalidatePath('/files', 'layout');
  if (returnTo) redirect(returnTo);
  return success('File deleted.');
}

export async function shareFileAction(fileId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!(await getActionAccess(permissionKeys.filesUpload))) return failure(noPermission);

  const parsed = fileShareSchema.safeParse({
    employeeIds: formData.getAll('employeeIds'),
    departmentIds: formData.getAll('departmentIds'),
    note: formData.get('note') ?? '',
    expiresOn: formData.get('expiresOn') ?? '',
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { employeeIds, departmentIds, note, expiresOn } = parsed.data;
  // A share runs to the end of its last day, in Indian time.
  const expiresAt = expiresOn ? `${expiresOn}T23:59:59+05:30` : null;

  const rows = [
    ...employeeIds.map((id) => ({ file_id: fileId, recipient_employee_id: id, note, expires_at: expiresAt })),
    ...departmentIds.map((id) => ({ file_id: fileId, recipient_department_id: id, note, expires_at: expiresAt })),
  ];

  const database = await createDatabaseClient();
  const { error } = await database.from('file_shares').insert(rows);
  if (error) return databaseFailure(error);

  revalidatePath(`/files/${fileId}`);
  revalidatePath('/files');
  return success(`Sent to ${rows.length} ${rows.length === 1 ? 'recipient' : 'recipients'}.`);
}

export async function removeShareAction(fileId: string, shareId: string): Promise<ActionResult> {
  const database = await createDatabaseClient();
  const { data, error } = await database.from('file_shares').delete().eq('id', shareId).select('id');

  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath(`/files/${fileId}`);
  return success('Access removed.');
}

export async function addFileCommentAction(fileId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = fileCommentSchema.safeParse({ body: formData.get('body') });
  if (!parsed.success) return validationFailure(parsed.error);

  const database = await createDatabaseClient();
  const { error } = await database.from('file_comments').insert({ file_id: fileId, body: parsed.data.body });
  if (error) return databaseFailure(error);

  revalidatePath(`/files/${fileId}`);
  return success('Comment added.');
}
