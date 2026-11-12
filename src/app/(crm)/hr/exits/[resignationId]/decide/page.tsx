import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ResignationDecisionForm } from '@/components/exits/ExitForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getResignation } from '@/server/services/exitService';

export const metadata: Metadata = { title: 'Decide resignation' };

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export default async function DecideResignationPage({ params }: { params: Promise<{ resignationId: string }> }) {
  await requirePagePermission(permissionKeys.exitsManage);
  const resignationId = parseId((await params).resignationId);
  if (!resignationId) notFound();
  const resignation = await getResignation(resignationId);
  if (!resignation || resignation.status !== 'submitted') notFound();

  const suggested = resignation.notice_days !== null ? addDays(resignation.submitted_on, resignation.notice_days) : resignation.proposed_last_day;

  return (
    <>
      <PageHeader title={`Resignation: ${resignation.employee?.full_name}`} description={`Submitted ${formatDate(resignation.submitted_on)}.`} />
      <Panel>
        <p className={`${layout.text} ${layout.muted}`}>{resignation.reason}</p>
        <div className={layout.spaced}>
          <ResignationDecisionForm resignationId={resignation.id} suggestedLastDay={suggested} />
        </div>
      </Panel>
    </>
  );
}
