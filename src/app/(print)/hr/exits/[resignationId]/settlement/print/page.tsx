import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SettlementPrint } from '@/components/exits/SettlementPrint';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requireAccess } from '@/server/services/accessService';
import { getResignation, getSettlement } from '@/server/services/exitService';
import { getCompanyProfile } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Full and final statement' };

export default async function SettlementPrintPage({ params }: { params: Promise<{ resignationId: string }> }) {
  const access = await requireAccess();
  if (access.permissions[permissionKeys.exitsManage] === undefined && access.permissions[permissionKeys.payrollApprove] === undefined) notFound();
  const resignationId = parseId((await params).resignationId);
  if (!resignationId) notFound();
  const [resignation, settlement, company] = await Promise.all([getResignation(resignationId), getSettlement(resignationId), getCompanyProfile()]);
  if (!resignation || !settlement) notFound();
  return <SettlementPrint resignation={resignation} settlement={settlement} company={company} />;
}
