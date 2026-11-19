import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { WorkloadFlagSettingsForm } from '@/components/workload/WorkloadFlagForms';
import { WorkloadFlagList } from '@/components/workload/WorkloadFlagList';
import { WorkloadTabs } from '@/components/workload/WorkloadTabs';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { sortFlags, workloadFlagLabels, type WorkloadFlagKind } from '@/lib/workload/workloadFlags';
import { requirePagePermission } from '@/server/services/accessService';
import { getWorkloadFlagSettings, getWorkloadFlags } from '@/server/services/workloadService';

export const metadata: Metadata = { title: 'Red flags' };

export default async function WorkloadFlagsPage() {
  const access = await requirePagePermission(permissionKeys.workloadView);
  const canComment = access.permissions[permissionKeys.workloadReportSend] !== undefined;
  const canSetLimits = access.permissions[permissionKeys.workloadFlagsManage] !== undefined;
  const [flags, settings] = await Promise.all([getWorkloadFlags(), canSetLimits ? getWorkloadFlagSettings() : Promise.resolve(null)]);
  const open = flags.filter((flag) => !flag.note);
  const count = (kind: WorkloadFlagKind) => open.filter((flag) => flag.kind === kind).length;

  return (
    <>
      <PageHeader
        title="Workload"
        description="Work that needs someone to look into it. Open the task or person, then mark the flag looked into with what was done. Reports sent include the open flags and these comments."
      />
      <div className={layout.stack}>
        <WorkloadTabs access={access} current="flags" />
        <StatTiles
          tiles={[
            { label: 'Open flags', value: open.length },
            ...(Object.keys(workloadFlagLabels) as WorkloadFlagKind[]).map((kind) => ({ label: workloadFlagLabels[kind], value: count(kind) })),
          ]}
        />
        <Panel title="Red flags" description={`${open.length} open · ${flags.length - open.length} looked into`} flush>
          {flags.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No red flags" description="Nothing is overdue, stuck in review or idle right now." />
          ) : (
            <WorkloadFlagList flags={sortFlags(flags)} canComment={canComment} />
          )}
        </Panel>
        {settings && (
          <Panel
            title="Limits"
            description="When work is flagged. Idle days count only working days the person was not on leave. Attendance is checked against hours on tasks for the last working day."
          >
            <WorkloadFlagSettingsForm settings={settings} />
          </Panel>
        )}
      </div>
    </>
  );
}
