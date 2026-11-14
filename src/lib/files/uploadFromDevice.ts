import { checkUploadable, fileTypeOf } from '@/lib/files/fileTypes';
import { abandonUploadAction, finishUploadAction, startUploadAction } from '@/server/actions/fileActions';

// Uploads a file from this device into the person's own Files, and returns its id. Used
// by chat attachments, reimbursement receipts and leave documents. The file goes
// straight to storage; the website is only asked to start and finish it.
export async function uploadFromDevice(file: File) {
  const problem = checkUploadable(file);
  if (problem) throw new Error(problem);

  const started = await startUploadAction({ name: file.name, size: file.size });
  if (started.status === 'error') throw new Error(started.message);

  const response = await fetch(started.ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': fileTypeOf(file.name)?.mime ?? 'application/octet-stream', 'x-upsert': 'false' },
    body: file,
  });
  if (!response.ok) {
    await abandonUploadAction(started.ticket.fileId);
    throw new Error(`${file.name}: the upload failed. Please try again.`);
  }

  const finished = await finishUploadAction(started.ticket.versionId);
  if (finished.status === 'error') throw new Error(finished.message);
  return started.ticket.fileId;
}
