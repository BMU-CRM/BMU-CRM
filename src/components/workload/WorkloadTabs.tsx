import { PageTabs } from '@/components/ui/PageTabs';
import { permissionKeys } from '@/lib/access/permissionKeys';
import type { CurrentAccess } from '@/server/services/accessService';

type WorkloadTab = 'now' | 'report' | 'received';

// The Workload page's views: as things stand now, a day or week report, and the
// reports sent (for those who receive them, or have sent some).
export function WorkloadTabs({ access, current }: { access: CurrentAccess; current: WorkloadTab }) {
  const has = (key: string) => access.permissions[key] !== undefined;
  const tabs = [
    ...(has(permissionKeys.workloadView)
      ? [
          { href: '/workload', label: 'Now', current: current === 'now' },
          { href: '/workload/report', label: 'Day or week report', current: current === 'report' },
        ]
      : []),
    ...(has(permissionKeys.workloadReportReceive) || has(permissionKeys.workloadReportSend)
      ? [{ href: '/workload/reports', label: has(permissionKeys.workloadReportReceive) ? 'Received reports' : 'Sent reports', current: current === 'received' }]
      : []),
  ];
  return tabs.length > 1 ? <PageTabs label="Workload views" tabs={tabs} /> : null;
}
