import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import {
  DepartmentWorkloadTable,
  EmployeePerformanceTable,
  EmployeeWorkloadTable,
} from '@/components/workload/WorkloadTables';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { summariseByDepartment, weeklyCapacityHours } from '@/lib/tasks/calculateWorkload';
import { requirePagePermission } from '@/server/services/accessService';
import { getWorkloads } from '@/server/services/workloadService';

export const metadata: Metadata = { title: 'Workload' };

export default async function WorkloadPage() {
  await requirePagePermission(permissionKeys.workloadView);

  const workloads = await getWorkloads();
  const departments = summariseByDepartment(workloads);

  return (
    <>
      <PageHeader
        title="Workload"
        description={`The load compares remaining work with ${weeklyCapacityHours} hours a week, weighted by priority and overdue work.`}
      />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Overloaded', value: workloads.filter((person) => person.indicator === 'overloaded').length },
            { label: 'Balanced', value: workloads.filter((person) => person.indicator === 'balanced').length },
            { label: 'Have capacity', value: workloads.filter((person) => person.indicator === 'underutilised').length },
          ]}
        />
        <Panel title="By person" flush>
          <EmployeeWorkloadTable workloads={workloads} />
        </Panel>
        <Panel title="By department" flush>
          <DepartmentWorkloadTable departments={departments} />
        </Panel>
        <Panel
          title="Performance, last 90 days"
          description="Read these together. Task counts alone do not show complexity, quality or timeliness."
          flush
        >
          <EmployeePerformanceTable workloads={workloads} />
        </Panel>
      </div>
    </>
  );
}
