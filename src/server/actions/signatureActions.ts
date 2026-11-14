'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { databaseFailure, failure, success, validationFailure, type ActionResult } from '@/lib/actionResult';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { getActionAccess } from '@/server/services/accessService';
import { chosenFile, toStoredImage } from '@/server/services/documentImages';

const noPermission = 'You do not have permission to do this.';
const titleSchema = z.object({
  title: z.string().trim().max(80, 'Use 80 characters or fewer.').refine((value) => value === '' || value.length >= 2, 'Use at least 2 characters.'),
});

// Saves your signature, the company seal and the title printed under your name. An
// image left empty keeps the one already saved, unless its "remove" box is ticked.
export async function saveDocumentSignatureAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const access = await getActionAccess();
  if (!access) return failure(noPermission);
  const canSign =
    access.permissions[permissionKeys.invoicesManage] !== undefined || access.permissions[permissionKeys.quotationsManage] !== undefined;
  if (!canSign) return failure(noPermission);

  const parsed = titleSchema.safeParse({ title: formData.get('title') ?? '' });
  if (!parsed.success) return validationFailure(parsed.error);

  const row: { signatory_title: string | null; signature_image?: string | null; seal_image?: string | null } = {
    signatory_title: parsed.data.title || null,
  };

  const signatureFile = chosenFile(formData, 'signature');
  if (signatureFile) {
    const stored = await toStoredImage(signatureFile, { width: 600, height: 240 });
    if ('error' in stored) return { status: 'error', message: stored.error, fieldErrors: { signature: stored.error } };
    row.signature_image = stored.image;
  } else if (formData.get('removeSignature') === 'on') {
    row.signature_image = null;
  }

  const sealFile = chosenFile(formData, 'seal');
  if (sealFile) {
    const stored = await toStoredImage(sealFile, { width: 400, height: 400 });
    if ('error' in stored) return { status: 'error', message: stored.error, fieldErrors: { seal: stored.error } };
    row.seal_image = stored.image;
  } else if (formData.get('removeSeal') === 'on') {
    row.seal_image = null;
  }

  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('document_signatures')
    .upsert({ employee_id: access.employee.id, ...row }, { onConflict: 'employee_id' })
    .select('employee_id');
  if (error) return databaseFailure(error);
  if (data.length === 0) return failure(noPermission);

  revalidatePath('/profile');
  revalidatePath('/overview');
  return success('Saved. Tick “Sign with my signature” on a quotation or invoice to add them.');
}
