import 'server-only';
import { createDatabaseClient } from '@/server/database/databaseClient';

export type Signatory = {
  employeeId: string;
  name: string;
  // Printed under the name, such as "Founder" or "Client Manager".
  title: string;
  signatureImage: string | null;
  sealImage: string | null;
};

// What this person has saved, as they entered it, for My profile.
export async function getSavedSignature(employeeId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('document_signatures')
    .select('signature_image, seal_image, signatory_title, updated_at')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type SigningChoice = {
  myId: string;
  hasSignature: boolean;
  hasSeal: boolean;
  currentSigner: { id: string; name: string } | null;
  showSeal: boolean | null;
};

// What the quotation and invoice form offers: your own signature and seal if you have
// uploaded them, and who has signed the document so far.
export async function getSigningChoice(myId: string, document?: { signed_by: string | null; show_seal: boolean } | null): Promise<SigningChoice> {
  const [mine, signer] = await Promise.all([getSavedSignature(myId), getSignatory(document?.signed_by ?? null)]);
  return {
    myId,
    hasSignature: Boolean(mine?.signature_image),
    hasSeal: Boolean(mine?.seal_image),
    currentSigner: signer ? { id: signer.employeeId, name: signer.name } : null,
    showSeal: document ? document.show_seal : null,
  };
}

// The signature, seal and printed title of one person, with their role as the title
// until they choose another.
export async function getSignatory(employeeId: string | null): Promise<Signatory | null> {
  if (!employeeId) return null;
  const database = await createDatabaseClient();
  const [person, signature] = await Promise.all([
    database.from('employees').select('id, full_name, role:roles(name)').eq('id', employeeId).maybeSingle(),
    database.from('document_signatures').select('signature_image, seal_image, signatory_title').eq('employee_id', employeeId).maybeSingle(),
  ]);
  if (person.error) throw person.error;
  if (signature.error) throw signature.error;
  if (!person.data) return null;
  return {
    employeeId,
    name: person.data.full_name,
    title: signature.data?.signatory_title ?? person.data.role?.name ?? 'Authorised signatory',
    signatureImage: signature.data?.signature_image ?? null,
    sealImage: signature.data?.seal_image ?? null,
  };
}
