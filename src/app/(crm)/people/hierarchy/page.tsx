import { Network } from 'lucide-react';
import type { Metadata } from 'next';
import { OrganisationTree, type HierarchyPerson } from '@/components/hierarchy/OrganisationTree';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { buildOrganisationTree } from '@/lib/organisation/buildOrganisationTree';
import { requirePagePermission } from '@/server/services/accessService';
import { listHierarchyPeople } from '@/server/services/employeeService';

export const metadata: Metadata = { title: 'Hierarchy' };

export default async function HierarchyPage() {
  await requirePagePermission(permissionKeys.organisationView);

  const rows = await listHierarchyPeople();

  const people: HierarchyPerson[] = rows
    .toSorted(
      (first, second) =>
        (first.designation?.management_level ?? 99) - (second.designation?.management_level ?? 99),
    )
    .map((row) => ({
      id: row.id,
      reportingManagerId: row.reporting_manager_id,
      fullName: row.full_name,
      designation: row.designation?.title ?? null,
      department: row.department?.name ?? null,
    }));

  return (
    <>
      <PageHeader title="Hierarchy" description="Who reports to whom, based on each employee's reporting manager." />
      <Panel flush>
        {people.length === 0 ? (
          <EmptyState icon={Network} title="No one here yet" description="The chart builds itself as employees are added." />
        ) : (
          <OrganisationTree roots={buildOrganisationTree(people)} />
        )}
      </Panel>
    </>
  );
}
