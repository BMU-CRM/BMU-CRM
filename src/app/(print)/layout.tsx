import type { ReactNode } from 'react';
import { requireAccess } from '@/server/services/accessService';

// Printable documents, without the sidebar and header, so the printout or PDF holds
// only the document itself. Each page still checks access to what it shows.
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireAccess();
  return children;
}
