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
import { summariseByDepartment, weeklyCapacityHours, type EmployeeWorkload } from '@/lib/tasks/calculateWorkload';
import { requirePagePermission } from '@/server/services/accessService';
import { listDepartmentOptions } from '@/server/services/ticketService';
import { getWorkloads } from '@/server/services/workloadService';

export const metadata: Metadata = { title: 'Workload' };

export default async function WorkloadPage() {
  await requirePagePermission(permissionKeys.workloadView);

  const [workloads, departmentOptions] = await Promise.all([getWorkloads(), listDepartmentOptions()]);
  const departments = summariseByDepartment(workloads);
  const departmentIds = new Map(departmentOptions.map((department) => [department.name, department.id]));
  const total = (stage: keyof EmployeeWorkload['stageCounts']) =>
    workloads.reduce((sum, person) => sum + person.stageCounts[stage], 0);

  return (
    <>
      <PageHeader
        title="Workload"
        description={`What everyone in your reach is doing, has done and has yet to start. Click a name or a number to open those tasks. The load compares remaining work with ${weeklyCapacityHours} hours a week, weighted by priority and overdue work.`}
      />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Yet to start', value: total('todo') },
            { label: 'Being worked on', value: total('doing') },
            { label: 'Waiting for review', value: total('review') },
            { label: 'Done, last 90 days', value: total('done') },
          ]}
        />
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
          <DepartmentWorkloadTable departments={departments} departmentIds={departmentIds} />
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
